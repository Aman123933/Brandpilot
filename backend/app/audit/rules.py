import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple


SUPERLATIVE_PATTERNS = [
    re.compile(r"\b#1\b", re.IGNORECASE),
    re.compile(r"\b100%\b", re.IGNORECASE),
    re.compile(r"\bnumber\s+one\b", re.IGNORECASE),
    re.compile(r"\bnever\s+fails\b", re.IGNORECASE),
    re.compile(r"\brevolutionary\b", re.IGNORECASE),
    re.compile(r"\bguaranteed\b", re.IGNORECASE),
    re.compile(r"\bbest\b", re.IGNORECASE),
]

CITATION_INDICATORS = [
    re.compile(r"\b(?:source|cited|according\s+to|tested\s+by|certified\s+by|lab\s+report|study)\b", re.IGNORECASE),
]

COMMON_JARGON_ABBREVIATIONS = {
    "ANC": "Active Noise Cancellation",
    "DSP": "Digital Signal Processing",
    "SPL": "Sound Pressure Level",
    "THD": "Total Harmonic Distortion",
    "TWS": "True Wireless Stereo",
    "DAC": "Digital-to-Analog Converter",
    "SNR": "Signal-to-Noise Ratio",
    "EQ": "Equalizer",
}

COMMON_NON_JARGON_ACRONYMS = {
    "USD", "USA", "UK", "EU", "AM", "PM", "ID", "AI", "IPX", "DB", "TV", "PC", "HD"
}


def normalize_intake_text(text: str) -> str:
    """Normalize line endings and horizontal whitespace once at intake to keep offsets stable."""
    if not text:
        return ""
    # Standardize line endings to \n
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse horizontal spaces/tabs (preserving single \n)
    text = re.sub(r"[^\S\n]+", " ", text)
    # Strip trailing/leading spaces per line
    lines = [line.strip() for line in text.split("\n")]
    text = "\n".join(lines)
    # Collapse 3+ newlines to 2 newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def check_banned_terms(text: str, guideline_version: Any) -> List[Dict[str, Any]]:
    """Check text against banned terms defined in the active GuidelineVersion rules."""
    findings = []
    if not guideline_version or not hasattr(guideline_version, "rules"):
        return findings

    rules = guideline_version.rules or {}
    banned_terms = rules.get("banned_terms", [])

    for item in banned_terms:
        term = item.get("term", "").strip()
        why = item.get("why", "Violates brand voice policy")
        preferred = item.get("preferred", "")

        if not term:
            continue

        # Whole-word, case-insensitive match (allowing optional product noun in phrases like 'best in the world')
        if term.lower() == "best in the world":
            pattern = re.compile(r"\bbest\s+(?:\w+\s+)?in\s+the\s+world\b", re.IGNORECASE)
        else:
            pattern = re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)

        for match in pattern.finditer(text):
            start, end = match.start(), match.end()
            quote = text[start:end]
            findings.append({
                "kind": "rule_violation",
                "severity": "high",
                "rule_id": item.get("id"),
                "quote": quote,
                "start_offset": start,
                "end_offset": end,
                "explanation": f"Banned term '{term}' violates brand guidelines: {why}",
                "suggestion": preferred,
                "source_type": "guideline",
                "source_ref": getattr(guideline_version, "id", None),
                "origin": "rules",
                "status": "open",
            })

    return findings


def check_unsupported_superlatives(
    text: str,
    existing_findings: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Flag unsupported superlatives and absolutes unless backed by cited source or verified fact."""
    findings = []
    # Avoid overlapping with existing rule violations (e.g. if 'best in the world' or 'guaranteed' was banned)
    covered_spans = [(f["start_offset"], f["end_offset"]) for f in existing_findings]

    # Check if text overall cites sources
    has_text_citation = any(ind.search(text) for ind in CITATION_INDICATORS)

    for pattern in SUPERLATIVE_PATTERNS:
        for match in pattern.finditer(text):
            start, end = match.start(), match.end()

            # Skip if inside an already flagged span
            if any(c_start <= start and end <= c_end for c_start, c_end in covered_spans):
                continue

            # Check local context around superlative for citation (within 100 chars)
            local_start = max(0, start - 100)
            local_end = min(len(text), end + 100)
            local_context = text[local_start:local_end]
            if has_text_citation or any(ind.search(local_context) for ind in CITATION_INDICATORS):
                continue

            quote = text[start:end]
            findings.append({
                "kind": "unsupported_claim",
                "severity": "medium",
                "quote": quote,
                "start_offset": start,
                "end_offset": end,
                "explanation": f"Unsupported superlative or absolute claim '{quote}' requires verification or cited source.",
                "suggestion": "Provide a cited source or replace with verified descriptive claim.",
                "source_type": "none",
                "source_ref": None,
                "origin": "rules",
                "status": "open",
            })

    return findings


def _is_expired(valid_until: Optional[datetime]) -> bool:
    if not valid_until:
        return False
    now = datetime.now(timezone.utc)
    if valid_until.tzinfo is None:
        valid_until = valid_until.replace(tzinfo=timezone.utc)
    return valid_until < now


def _extract_fact_mentions(text: str, fact: Any, fact_version: Any) -> List[Dict[str, Any]]:
    """Extract and compare fact values mentioned in text for a given FactVersion."""
    findings = []
    key = fact.key.lower()
    is_expired = _is_expired(fact_version.valid_until)

    # Battery
    if "battery" in key:
        pattern = re.compile(
            r"(?:(\d+(?:\.\d+)?)\s*(?:hours|hrs|h)\s*(?:of)?\s*(?:battery(?:\s*life)?|playback|listening))|"
            r"(?:(?:battery(?:\s*life)?|playback|listening(?:\s*time)?)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:hours|hrs|h))",
            re.IGNORECASE,
        )
        try:
            expected_val = float(re.search(r"\d+", fact_version.value).group(0))
        except Exception:
            expected_val = None

        for match in pattern.finditer(text):
            num_str = match.group(1) or match.group(2)
            if not num_str:
                continue
            stated_val = float(num_str)
            start, end = match.start(), match.end()
            quote = text[start:end]

            if is_expired:
                findings.append({
                    "kind": "fact_mismatch",
                    "severity": "high",
                    "quote": quote,
                    "start_offset": start,
                    "end_offset": end,
                    "explanation": f"Relies on expired fact: Fact '{fact.key}' expired on {fact_version.valid_until.strftime('%Y-%m-%d')}.",
                    "suggestion": f"{fact_version.value} hours",
                    "source_type": "fact",
                    "source_ref": fact_version.id,
                    "origin": "rules",
                    "status": "open",
                })
            elif expected_val is not None and abs(stated_val - expected_val) > 0.01:
                findings.append({
                    "kind": "fact_mismatch",
                    "severity": "high",
                    "quote": quote,
                    "start_offset": start,
                    "end_offset": end,
                    "explanation": f"Stated battery specification of {num_str} hours differs from approved fact ({fact_version.value} hours).",
                    "suggestion": f"{fact_version.value} hours of battery life",
                    "source_type": "fact",
                    "source_ref": fact_version.id,
                    "origin": "rules",
                    "status": "open",
                })

    # Warranty
    elif "warranty" in key:
        pattern = re.compile(
            r"(?:(\d+(?:\.\d+)?)\s*(?:-| )(?:years?|yrs?|months?|mos?)\s*warranty)|"
            r"(?:warranty\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:years?|yrs?|months?|mos?))",
            re.IGNORECASE,
        )
        try:
            expected_months = float(re.search(r"\d+", fact_version.value).group(0))
            if fact_version.unit and "year" in fact_version.unit.lower():
                expected_months *= 12
        except Exception:
            expected_months = 12.0

        for match in pattern.finditer(text):
            num_str = match.group(1) or match.group(2)
            if not num_str:
                continue
            stated_num = float(num_str)
            match_text = match.group(0).lower()
            stated_months = stated_num * 12 if ("year" in match_text or "yr" in match_text) else stated_num

            start, end = match.start(), match.end()
            quote = text[start:end]

            if is_expired:
                findings.append({
                    "kind": "fact_mismatch",
                    "severity": "high",
                    "quote": quote,
                    "start_offset": start,
                    "end_offset": end,
                    "explanation": f"Relies on expired fact: Fact '{fact.key}' expired on {fact_version.valid_until.strftime('%Y-%m-%d')}.",
                    "suggestion": f"{fact_version.value} {fact_version.unit or 'months'} warranty",
                    "source_type": "fact",
                    "source_ref": fact_version.id,
                    "origin": "rules",
                    "status": "open",
                })
            elif abs(stated_months - expected_months) > 0.01:
                findings.append({
                    "kind": "fact_mismatch",
                    "severity": "high",
                    "quote": quote,
                    "start_offset": start,
                    "end_offset": end,
                    "explanation": f"Stated warranty of {quote} differs from approved fact ({fact_version.value} {fact_version.unit or 'months'}).",
                    "suggestion": f"{fact_version.value}-{fact_version.unit or 'month'} warranty",
                    "source_type": "fact",
                    "source_ref": fact_version.id,
                    "origin": "rules",
                    "status": "open",
                })

    # Return window
    elif "return" in key:
        pattern = re.compile(
            r"(\d+(?:\.\d+)?)\s*(?:-| )days?\s*(?:return|money[- ]back)",
            re.IGNORECASE,
        )
        try:
            expected_days = float(re.search(r"\d+", fact_version.value).group(0))
        except Exception:
            expected_days = 30.0

        for match in pattern.finditer(text):
            stated_days = float(match.group(1))
            start, end = match.start(), match.end()
            quote = text[start:end]

            if is_expired:
                findings.append({
                    "kind": "fact_mismatch",
                    "severity": "high",
                    "quote": quote,
                    "start_offset": start,
                    "end_offset": end,
                    "explanation": f"Relies on expired fact: Fact '{fact.key}' expired on {fact_version.valid_until.strftime('%Y-%m-%d')}.",
                    "suggestion": f"{fact_version.value} days return",
                    "source_type": "fact",
                    "source_ref": fact_version.id,
                    "origin": "rules",
                    "status": "open",
                })
            elif abs(stated_days - expected_days) > 0.01:
                findings.append({
                    "kind": "fact_mismatch",
                    "severity": "high",
                    "quote": quote,
                    "start_offset": start,
                    "end_offset": end,
                    "explanation": f"Stated return window of {match.group(1)} days differs from approved fact ({fact_version.value} days).",
                    "suggestion": f"{fact_version.value}-day return window",
                    "source_type": "fact",
                    "source_ref": fact_version.id,
                    "origin": "rules",
                    "status": "open",
                })

    # Price
    elif "price" in key:
        pattern = re.compile(r"\$\s*(\d+(?:\.\d+)?)|(?:(\d+(?:\.\d+)?)\s*(?:USD|dollars))", re.IGNORECASE)
        try:
            expected_price = float(re.search(r"\d+", fact_version.value).group(0))
        except Exception:
            expected_price = None

        for match in pattern.finditer(text):
            price_str = match.group(1) or match.group(2)
            if not price_str or expected_price is None:
                continue
            stated_price = float(price_str)
            start, end = match.start(), match.end()
            quote = text[start:end]

            if is_expired:
                findings.append({
                    "kind": "fact_mismatch",
                    "severity": "high",
                    "quote": quote,
                    "start_offset": start,
                    "end_offset": end,
                    "explanation": f"Relies on expired fact: Fact '{fact.key}' expired on {fact_version.valid_until.strftime('%Y-%m-%d')}.",
                    "suggestion": f"${fact_version.value}",
                    "source_type": "fact",
                    "source_ref": fact_version.id,
                    "origin": "rules",
                    "status": "open",
                })
            elif abs(stated_price - expected_price) > 0.01:
                findings.append({
                    "kind": "fact_mismatch",
                    "severity": "high",
                    "quote": quote,
                    "start_offset": start,
                    "end_offset": end,
                    "explanation": f"Stated price of ${stated_price:.0f} differs from approved fact (${expected_price:.0f}).",
                    "suggestion": f"${fact_version.value}",
                    "source_type": "fact",
                    "source_ref": fact_version.id,
                    "origin": "rules",
                    "status": "open",
                })

    # Generic expired check for other facts if mentioned
    elif is_expired:
        key_pattern = re.compile(rf"\b{re.escape(key.replace('_', ' '))}\b", re.IGNORECASE)
        match = key_pattern.search(text)
        if match:
            start, end = match.start(), match.end()
            findings.append({
                "kind": "fact_mismatch",
                "severity": "high",
                "quote": text[start:end],
                "start_offset": start,
                "end_offset": end,
                "explanation": f"Relies on expired fact: Fact '{fact.key}' expired on {fact_version.valid_until.strftime('%Y-%m-%d')}.",
                "suggestion": f"{fact_version.value} {fact_version.unit or ''}".strip(),
                "source_type": "fact",
                "source_ref": fact_version.id,
                "origin": "rules",
                "status": "open",
            })

    return findings


def check_fact_mismatches(text: str, facts: List[Any]) -> List[Dict[str, Any]]:
    """Check text against all active FactVersions in the organization."""
    findings = []
    for fact in facts:
        # Find current version
        current_version = None
        for v in (fact.versions or []):
            if v.is_current:
                current_version = v
                break
        if not current_version and hasattr(fact, "current_version"):
            current_version = fact.current_version

        if not current_version:
            continue

        findings.extend(_extract_fact_mentions(text, fact, current_version))

    return findings


def check_accessibility(text: str) -> List[Dict[str, Any]]:
    """Check basic accessibility: ALL-CAPS runs over 4 words, jargon abbreviations, missing alt text."""
    findings = []

    # 1. ALL-CAPS runs over 4 words (5 or more consecutive all-caps words)
    caps_pattern = re.compile(r"\b[A-Z]{2,}(?:\s+[A-Z]{2,}){4,}\b")
    for match in caps_pattern.finditer(text):
        start, end = match.start(), match.end()
        quote = text[start:end]
        findings.append({
            "kind": "accessibility",
            "severity": "low",
            "quote": quote,
            "start_offset": start,
            "end_offset": end,
            "explanation": "Run of ALL-CAPS text over 4 words harms readability and screen reader accessibility.",
            "suggestion": quote.title(),
            "source_type": "none",
            "source_ref": None,
            "origin": "rules",
            "status": "open",
        })

    # 2. Unexplained jargon abbreviations on first use
    for abbrev, expansion in COMMON_JARGON_ABBREVIATIONS.items():
        pattern = re.compile(rf"\b{re.escape(abbrev)}\b")
        matches = list(pattern.finditer(text))
        if not matches:
            continue

        first_match = matches[0]
        start, end = first_match.start(), first_match.end()

        # Check surrounding text (within 80 characters before and after) for explanation
        context_window = text[max(0, start - 80):min(len(text), end + 80)].lower()
        expansion_lower = expansion.lower()

        if expansion_lower not in context_window:
            findings.append({
                "kind": "accessibility",
                "severity": "low",
                "quote": text[start:end],
                "start_offset": start,
                "end_offset": end,
                "explanation": f"Jargon abbreviation '{abbrev}' is used on first use without expansion. Readers and screen readers benefit from an expansion on first reference.",
                "suggestion": f"{expansion} ({abbrev})",
                "source_type": "none",
                "source_ref": None,
                "origin": "rules",
                "status": "open",
            })

    # 3. Missing alt-text markers when document contains image placeholders
    img_placeholders = [
        re.compile(r"\[(?:image|img|photo|graphic|figure)(?:\s*placeholder)?\]", re.IGNORECASE),
        re.compile(r"!\[\s*\]\([^\)]*\)"),
        re.compile(r"<img(?![^>]*\balt=[\'\"][^\'\"]+[\'\"])[^>]*>", re.IGNORECASE),
    ]
    for pattern in img_placeholders:
        for match in pattern.finditer(text):
            start, end = match.start(), match.end()
            findings.append({
                "kind": "accessibility",
                "severity": "medium",
                "quote": text[start:end],
                "start_offset": start,
                "end_offset": end,
                "explanation": "Document contains an image placeholder missing descriptive alt-text for screen reader users.",
                "suggestion": "[Image: descriptive explanation of image]",
                "source_type": "none",
                "source_ref": None,
                "origin": "rules",
                "status": "open",
            })

    return findings


def verify_finding_offsets(text: str, finding: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Verify and enforce that finding quote matches text[start_offset:end_offset] exactly."""
    if "rule_id" not in finding:
        finding["rule_id"] = None

    start = finding.get("start_offset", -1)
    end = finding.get("end_offset", -1)
    quote = finding.get("quote", "")

    if not quote:
        return None

    # Check direct match
    if 0 <= start < end <= len(text) and text[start:end] == quote:
        return finding

    # Attempt to locate quote if offset was slightly displaced
    idx = text.find(quote)
    if idx != -1:
        finding["start_offset"] = idx
        finding["end_offset"] = idx + len(quote)
        return finding

    # Quote does not exist in text
    return None


def run_deterministic_rules(
    text: str,
    guideline_version: Optional[Any],
    facts: List[Any],
) -> List[Dict[str, Any]]:
    """Run all deterministic checks without any AI dependency."""
    all_findings: List[Dict[str, Any]] = []

    # 1. Banned terms
    banned_findings = check_banned_terms(text, guideline_version)
    all_findings.extend(banned_findings)

    # 2. Unsupported superlatives and absolutes
    superlative_findings = check_unsupported_superlatives(text, banned_findings)
    all_findings.extend(superlative_findings)

    # 3. Fact mismatches & expired facts
    fact_findings = check_fact_mismatches(text, facts)
    all_findings.extend(fact_findings)

    # 4. Accessibility checks
    a11y_findings = check_accessibility(text)
    all_findings.extend(a11y_findings)

    # 5. Enforce offset verification on every single finding
    verified_findings = []
    for f in all_findings:
        v = verify_finding_offsets(text, f)
        if v is not None:
            verified_findings.append(v)

    return verified_findings
