import hashlib
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional, Set, Tuple
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from backend.app.config import settings
from backend.app.models import AiCache, AiCallLog
from backend.app.audit.prompts import (
    BRAND_AUDIT_SYSTEM_PROMPT,
    BRAND_AUDIT_USER_TEMPLATE,
    RED_TEAM_SYSTEM_PROMPT,
    RED_TEAM_USER_TEMPLATE,
)

logger = logging.getLogger("brandpilot.audit.gemini")

# Memory caches as fast layer:
_AUDIT_CACHE: Dict[str, List[Dict[str, Any]]] = {}
_REDTEAM_CACHE: Dict[str, List[Dict[str, Any]]] = {}


class GeminiAuditFindingItem(BaseModel):
    kind: str = Field(description="One of: tone, unsupported_claim, rule_violation")
    severity: str = Field(default="medium", description="One of: high, medium, low")
    quote: str = Field(description="Exact quote from the text")
    start_offset: int = Field(default=0, description="Start character index of quote in text")
    end_offset: int = Field(default=0, description="End character index of quote in text")
    explanation: str = Field(description="Explanation of the issue preserving creator intent")
    suggestion: str = Field(default="", description="Constructive suggestion preserving creator intent")
    source_type: str = Field(default="none", description="One of: guideline, fact, none")
    source_ref: Optional[int] = Field(None, description="Guideline version ID or fact version ID")


class GeminiAuditOutput(BaseModel):
    findings: List[GeminiAuditFindingItem] = Field(default_factory=list)


class GeminiRedTeamRiskItem(BaseModel):
    persona: str = Field(description="critical_journalist, competitor, or skeptical_customer")
    category: str = Field(description="misleading, unsupported_promise, reputational, or ambiguity")
    severity: str = Field(default="medium", description="high, medium, or low")
    quote: str = Field(description="Exact quote from the text")
    why: str = Field(description="Why this text poses a risk. Unverified claims must be labeled 'Unverified', never 'false'.")


class GeminiRedTeamOutput(BaseModel):
    risks: List[GeminiRedTeamRiskItem] = Field(default_factory=list)


def filter_relevant_facts(text: str, facts: List[Any]) -> List[Tuple[Any, Any]]:
    """Select only facts whose key, unit, or aliases relate to the text content."""
    text_lower = text.lower()
    relevant: List[Tuple[Any, Any]] = []

    topic_aliases = {
        "battery_life_hours": ["battery", "playback", "hours", "hrs", "listening"],
        "warranty_months": ["warranty", "guarantee", "months", "year", "years"],
        "price": ["price", "cost", "dollar", "$", "usd"],
        "return_window_days": ["return", "days", "money back"],
        "anc_noise_reduction": ["anc", "noise", "reduction", "cancellation", "db"],
        "bluetooth_version": ["bluetooth", "bt", "wireless"],
    }

    for fact in facts:
        current_version = None
        for v in (fact.versions or []):
            if v.is_current:
                current_version = v
                break
        if not current_version and hasattr(fact, "current_version"):
            current_version = fact.current_version

        if not current_version:
            continue

        key = fact.key.lower()
        aliases = topic_aliases.get(key, [key, key.replace("_", " ")])
        if any(alias in text_lower for alias in aliases):
            relevant.append((fact, current_version))

    return relevant


def _build_audit_cache_key(text: str, guideline_version_id: Optional[int], fact_version_ids: List[int]) -> str:
    sorted_facts = ",".join(str(f_id) for f_id in sorted(fact_version_ids))
    raw = f"audit:{text}|{guideline_version_id}|{sorted_facts}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _build_redteam_cache_key(text: str) -> str:
    raw = f"redteam:{text}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _is_retryable_error(exc: Exception) -> bool:
    """Check if the error is 503, 429, or timeout."""
    if isinstance(exc, (FutureTimeoutError, TimeoutError)):
        return True
    msg = str(exc).lower()
    return any(code in msg for code in [
        "503",
        "unavailable",
        "429",
        "resource_exhausted",
        "rate limit",
        "500",
        "502",
        "504",
        "deadline_exceeded",
        "timed out",
        "timeout",
    ])


def _execute_model_call(fn, model_name: str, timeout_seconds: float = 30.0):
    import inspect
    executor = ThreadPoolExecutor(max_workers=1)
    sig = inspect.signature(fn)
    call_args = (model_name,) if len(sig.parameters) > 0 else ()
    future = executor.submit(fn, *call_args)
    try:
        return future.result(timeout=timeout_seconds)
    except FutureTimeoutError as te:
        logger.warning(f"Gemini call with model '{model_name}' timed out after {timeout_seconds}s")
        raise te
    except Exception as exc:
        logger.warning(f"Gemini error with model '{model_name}': {exc}")
        raise exc
    finally:
        executor.shutdown(wait=False)


def _call_gemini_with_fallback(fn, timeout_seconds: float = 30.0) -> Tuple[Any, str]:
    """
    Tries GEMINI_MODEL first. On 429, 503 or timeout, tries each fallback model in order.
    Returns (result, answered_model).
    """
    main_model = settings.GEMINI_MODEL
    models_to_try = [main_model] + [
        m for m in settings.fallback_models_list if m and m != main_model
    ]

    last_exc = None
    for idx, model_name in enumerate(models_to_try):
        try:
            result = _execute_model_call(fn, model_name, timeout_seconds=timeout_seconds)
            logger.info(f"Gemini model '{model_name}' succeeded.")
            return result, model_name
        except Exception as exc:
            last_exc = exc
            if not _is_retryable_error(exc) and not isinstance(exc, (FutureTimeoutError, TimeoutError)):
                logger.warning(f"Gemini model '{model_name}' encountered non-retryable error: {exc}")
                raise exc
            logger.warning(
                f"Gemini model '{model_name}' failed: {exc}. "
                + (f"Attempting next fallback..." if idx + 1 < len(models_to_try) else "No more fallbacks.")
            )

    raise last_exc or RuntimeError("All Gemini models failed")


def _check_user_ai_rate_limit(db: Optional[Session], user_id: Optional[int]) -> bool:
    """Check if user has exceeded 5 AI calls per hour. Returns True if allowed, False if exceeded."""
    if not db or not user_id:
        return True
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    call_count = (
        db.query(AiCallLog)
        .filter(AiCallLog.user_id == user_id, AiCallLog.called_at >= one_hour_ago)
        .count()
    )
    return call_count < 5


def _record_user_ai_call(db: Optional[Session], user_id: Optional[int]):
    if not db or not user_id:
        return
    db.add(AiCallLog(user_id=user_id, called_at=datetime.now(timezone.utc)))
    db.commit()


def validate_gemini_findings(
    raw_findings: List[Dict[str, Any]],
    text: str,
    valid_guideline_id: Optional[int],
    valid_fact_ids: Set[int],
) -> List[Dict[str, Any]]:
    """Validate cited IDs exist in prompt context and quotes appear at offsets."""
    validated: List[Dict[str, Any]] = []

    for item in raw_findings:
        source_type = (item.get("source_type") or "none").lower()
        source_ref = item.get("source_ref")

        if source_type == "guideline":
            if not valid_guideline_id or source_ref != valid_guideline_id:
                continue
        elif source_type == "fact":
            if not source_ref or source_ref not in valid_fact_ids:
                continue
        else:
            source_type = "none"
            source_ref = None

        quote = item.get("quote", "").strip()
        if not quote:
            continue

        start = item.get("start_offset", -1)
        end = item.get("end_offset", -1)

        if not (0 <= start < end <= len(text) and text[start:end] == quote):
            idx = text.find(quote)
            if idx != -1:
                start = idx
                end = idx + len(quote)
            else:
                continue

        kind = item.get("kind", "tone")
        if kind not in ("rule_violation", "fact_mismatch", "unsupported_claim", "tone", "accessibility"):
            kind = "tone"

        severity = item.get("severity", "medium").lower()
        if severity not in ("high", "medium", "low"):
            severity = "medium"

        explanation = item.get("explanation", "Tone or messaging issue identified by AI review.")
        if "false" in explanation.lower() and "unverified" not in explanation.lower():
            explanation = explanation.replace("false", "Unverified").replace("False", "Unverified")

        validated.append({
            "kind": kind,
            "severity": severity,
            "quote": quote,
            "start_offset": start,
            "end_offset": end,
            "explanation": explanation,
            "suggestion": item.get("suggestion") or None,
            "source_type": source_type,
            "source_ref": source_ref,
            "origin": "ai",
            "status": "open",
            "rule_id": None,
        })

    return validated


def run_gemini_brand_audit(
    text: str,
    guideline_version: Optional[Any],
    facts: List[Any],
    db: Optional[Session] = None,
    user_id: Optional[int] = None,
) -> Tuple[List[Dict[str, Any]], bool, Optional[str]]:
    """
    Run Gemini Brand Audit assist.
    Returns (findings, ai_available, ai_message).
    """
    if not settings.GEMINI_API_KEY or not settings.GEMINI_API_KEY.strip():
        return [], False, "AI is not configured. Rule-based checks completed."

    # Retrieve only relevant facts
    relevant_pairs = filter_relevant_facts(text, facts)
    valid_fact_ids = {fv.id for _, fv in relevant_pairs}
    valid_guideline_id = guideline_version.id if guideline_version else None

    # Check cache (DB and memory)
    cache_key = _build_audit_cache_key(text, valid_guideline_id, list(valid_fact_ids))
    if cache_key in _AUDIT_CACHE:
        return _AUDIT_CACHE[cache_key], True, None

    if db:
        cached_entry = db.query(AiCache).filter(AiCache.cache_key == cache_key).first()
        if cached_entry:
            data = cached_entry.response_json or []
            _AUDIT_CACHE[cache_key] = data
            return data, True, None

    # Check user quota rate limit (5 AI calls per hour)
    if not _check_user_ai_rate_limit(db, user_id):
        return [], False, "AI hourly limit reached (5 calls per hour). Rule-based checks completed."

    # Build facts context string
    facts_lines = []
    for f, fv in relevant_pairs:
        val_str = str(fv.value)
        unit_str = (
            f" {fv.unit}"
            if fv.unit and not val_str.lower().endswith(str(fv.unit).lower())
            else ""
        )
        facts_lines.append(f"- Fact ID {fv.id}: {f.key} = {val_str}{unit_str} (Source: {fv.source_note or 'Internal'})")
    facts_context = "\n".join(facts_lines) if facts_lines else "None provided."

    # Build guideline context
    rules = getattr(guideline_version, "rules", {}) or {}
    user_prompt = BRAND_AUDIT_USER_TEMPLATE.format(
        content=text,
        guideline_version_id=valid_guideline_id or "N/A",
        guideline_title=getattr(getattr(guideline_version, "guideline", None), "title", "Brand Guidelines"),
        tone_notes=", ".join(rules.get("tone_notes", [])) or "None",
        required_phrases=", ".join(
            (rp.get("phrase", "") if isinstance(rp, dict) else str(rp))
            for rp in rules.get("required_phrases", [])
        ) or "None",
        banned_terms=json.dumps(rules.get("banned_terms", [])),
        claim_rules=json.dumps(rules.get("claim_rules", [])),
        facts_context=facts_context,
    )

    def _execute(model_name: str):
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        config = types.GenerateContentConfig(
            system_instruction=BRAND_AUDIT_SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=GeminiAuditOutput,
            temperature=0.2,
        )
        response = client.models.generate_content(
            model=model_name,
            contents=user_prompt,
            config=config,
        )
        return response.text

    try:
        timeout = float(settings.GEMINI_TIMEOUT_SECONDS)
        raw_text, answered_model = _call_gemini_with_fallback(_execute, timeout_seconds=timeout)
        parsed = json.loads(raw_text)
        raw_findings = parsed.get("findings", [])
        validated = validate_gemini_findings(raw_findings, text, valid_guideline_id, valid_fact_ids)

        # Store in DB cache and memory cache
        if db:
            db_entry = AiCache(
                cache_key=cache_key,
                task_type="audit",
                response_json=validated,
                model_used=answered_model,
                created_at=datetime.now(timezone.utc),
            )
            db.add(db_entry)
            db.commit()

        _record_user_ai_call(db, user_id)
        _AUDIT_CACHE[cache_key] = validated
        return validated, True, None
    except Exception as exc:
        logger.warning(f"Gemini brand audit failed: {exc}")
        return [], False, "AI service temporarily unavailable. Rule-based checks completed."


def run_gemini_red_team(
    text: str,
    db: Optional[Session] = None,
    user_id: Optional[int] = None,
) -> Tuple[List[Dict[str, Any]], bool, Optional[str]]:
    """
    Run Brand Red Team analysis with 3 personas: Critical Journalist, Competitor, Skeptical Customer.
    Returns (risks, ai_available, ai_message).
    """
    if not settings.GEMINI_API_KEY or not settings.GEMINI_API_KEY.strip():
        return [], False, "AI is not configured. Rule-based checks completed."

    cache_key = _build_redteam_cache_key(text)
    if cache_key in _REDTEAM_CACHE:
        return _REDTEAM_CACHE[cache_key], True, None

    if db:
        cached_entry = db.query(AiCache).filter(AiCache.cache_key == cache_key).first()
        if cached_entry:
            data = cached_entry.response_json or []
            _REDTEAM_CACHE[cache_key] = data
            return data, True, None

    # Check user quota rate limit (5 AI calls per hour)
    if not _check_user_ai_rate_limit(db, user_id):
        return [], False, "AI hourly limit reached (5 calls per hour). Rule-based checks completed."

    user_prompt = RED_TEAM_USER_TEMPLATE.format(content=text)

    def _execute(model_name: str):
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        config = types.GenerateContentConfig(
            system_instruction=RED_TEAM_SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=GeminiRedTeamOutput,
            temperature=0.3,
        )
        response = client.models.generate_content(
            model=model_name,
            contents=user_prompt,
            config=config,
        )
        return response.text

    try:
        timeout = float(settings.GEMINI_TIMEOUT_SECONDS)
        raw_text, answered_model = _call_gemini_with_fallback(_execute, timeout_seconds=timeout)
        parsed = json.loads(raw_text)
        raw_risks = parsed.get("risks", [])

        validated_risks = []
        for r in raw_risks:
            quote = r.get("quote", "").strip()
            persona = r.get("persona", "skeptical_customer")
            category = r.get("category", "unsupported_promise")
            severity = r.get("severity", "medium").lower()
            if severity not in ("high", "medium", "low"):
                severity = "medium"

            why = r.get("why", "Potential risk detected.")
            if "false" in why.lower() and "unverified" not in why.lower():
                why = why.replace("false", "Unverified").replace("False", "Unverified")

            start = -1
            end = -1
            if quote and quote in text:
                start = text.find(quote)
                end = start + len(quote)

            validated_risks.append({
                "persona": persona,
                "category": category,
                "severity": severity,
                "quote": quote or text[:30],
                "start_offset": start if start != -1 else None,
                "end_offset": end if end != -1 else None,
                "why": why,
                "label": "potential risks",
            })

        if db:
            db_entry = AiCache(
                cache_key=cache_key,
                task_type="redteam",
                response_json=validated_risks,
                model_used=answered_model,
                created_at=datetime.now(timezone.utc),
            )
            db.add(db_entry)
            db.commit()

        _record_user_ai_call(db, user_id)
        _REDTEAM_CACHE[cache_key] = validated_risks
        return validated_risks, True, None
    except Exception as exc:
        logger.warning(f"Gemini red team review failed: {exc}")
        return [], False, "AI service temporarily unavailable. Rule-based checks completed."
