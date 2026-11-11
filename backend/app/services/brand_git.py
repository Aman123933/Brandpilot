from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.app.models import (
    Guideline,
    GuidelineVersion,
    ContentAsset,
    Fact,
    Passport,
    ReplayRun,
)
from backend.app.audit.rules import run_deterministic_rules


def compute_guideline_diff(
    v_from: GuidelineVersion,
    v_to: GuidelineVersion,
) -> Dict[str, Any]:
    """
    Computes semantic diff between two guideline versions.
    Sections compared: banned_terms, required_phrases, claim_rules, tone_notes.
    """
    rules_from = v_from.rules or {}
    rules_to = v_to.rules or {}

    changes: List[Dict[str, Any]] = []

    # 1. Banned terms
    from_bt = {
        item.get("id") or item.get("term", "").lower(): item
        for item in rules_from.get("banned_terms", [])
        if isinstance(item, dict)
    }
    to_bt = {
        item.get("id") or item.get("term", "").lower(): item
        for item in rules_to.get("banned_terms", [])
        if isinstance(item, dict)
    }

    for key, item in to_bt.items():
        if key not in from_bt:
            changes.append({
                "kind": "added",
                "section": "banned_terms",
                "rule_id": item.get("id"),
                "before": None,
                "after": item,
            })
        elif from_bt[key] != item:
            changes.append({
                "kind": "changed",
                "section": "banned_terms",
                "rule_id": item.get("id"),
                "before": from_bt[key],
                "after": item,
            })

    for key, item in from_bt.items():
        if key not in to_bt:
            changes.append({
                "kind": "removed",
                "section": "banned_terms",
                "rule_id": item.get("id"),
                "before": item,
                "after": None,
            })

    # 2. Required phrases
    def _rp_key(rp: Any) -> str:
        if isinstance(rp, dict):
            return rp.get("id") or rp.get("phrase", "").lower()
        return str(rp).lower()

    from_rp = {_rp_key(rp): rp for rp in rules_from.get("required_phrases", [])}
    to_rp = {_rp_key(rp): rp for rp in rules_to.get("required_phrases", [])}

    for key, item in to_rp.items():
        rule_id = item.get("id") if isinstance(item, dict) else None
        if key not in from_rp:
            changes.append({
                "kind": "added",
                "section": "required_phrases",
                "rule_id": rule_id,
                "before": None,
                "after": item,
            })
        elif from_rp[key] != item:
            changes.append({
                "kind": "changed",
                "section": "required_phrases",
                "rule_id": rule_id,
                "before": from_rp[key],
                "after": item,
            })

    for key, item in from_rp.items():
        rule_id = item.get("id") if isinstance(item, dict) else None
        if key not in to_rp:
            changes.append({
                "kind": "removed",
                "section": "required_phrases",
                "rule_id": rule_id,
                "before": item,
                "after": None,
            })

    # 3. Claim rules
    def _cr_key(cr: Any) -> str:
        if isinstance(cr, dict):
            return cr.get("id") or cr.get("pattern", "").lower()
        return str(cr).lower()

    from_cr = {_cr_key(cr): cr for cr in rules_from.get("claim_rules", [])}
    to_cr = {_cr_key(cr): cr for cr in rules_to.get("claim_rules", [])}

    for key, item in to_cr.items():
        rule_id = item.get("id") if isinstance(item, dict) else None
        if key not in from_cr:
            changes.append({
                "kind": "added",
                "section": "claim_rules",
                "rule_id": rule_id,
                "before": None,
                "after": item,
            })
        elif from_cr[key] != item:
            changes.append({
                "kind": "changed",
                "section": "claim_rules",
                "rule_id": rule_id,
                "before": from_cr[key],
                "after": item,
            })

    for key, item in from_cr.items():
        rule_id = item.get("id") if isinstance(item, dict) else None
        if key not in to_cr:
            changes.append({
                "kind": "removed",
                "section": "claim_rules",
                "rule_id": rule_id,
                "before": item,
                "after": None,
            })

    # 4. Tone notes (list of strings compared as text)
    from_tn = rules_from.get("tone_notes", []) or []
    to_tn = rules_to.get("tone_notes", []) or []

    max_len = max(len(from_tn), len(to_tn))
    for i in range(max_len):
        if i >= len(from_tn):
            changes.append({
                "kind": "added",
                "section": "tone_notes",
                "rule_id": None,
                "before": None,
                "after": to_tn[i],
            })
        elif i >= len(to_tn):
            changes.append({
                "kind": "removed",
                "section": "tone_notes",
                "rule_id": None,
                "before": from_tn[i],
                "after": None,
            })
        elif from_tn[i] != to_tn[i]:
            changes.append({
                "kind": "changed",
                "section": "tone_notes",
                "rule_id": None,
                "before": from_tn[i],
                "after": to_tn[i],
            })

    summary = {
        "added": sum(1 for c in changes if c["kind"] == "added"),
        "removed": sum(1 for c in changes if c["kind"] == "removed"),
        "changed": sum(1 for c in changes if c["kind"] == "changed"),
    }

    return {
        "guideline_id": v_from.guideline_id,
        "from_version": v_from.version,
        "to_version": v_to.version,
        "summary": summary,
        "changes": changes,
    }


def _finding_fingerprint(f: Dict[str, Any]) -> str:
    rule_id = f.get("rule_id") or ""
    quote = (f.get("quote") or "").strip().lower()
    kind = f.get("kind") or ""
    return f"{kind}:{rule_id}:{quote}"


def run_deterministic_replay(
    db: Session,
    guideline: Guideline,
    active_version: Optional[GuidelineVersion],
    proposed_version: GuidelineVersion,
    scope: str = "approved",
) -> Dict[str, Any]:
    """
    Runs deterministic replay across in-scope assets comparing active guideline version
    against proposed guideline version.
    """
    now = datetime.now(timezone.utc)

    # In-scope assets
    query = db.query(ContentAsset).filter(ContentAsset.org_id == guideline.org_id)
    if scope == "approved":
        # Assets that have or had a passport
        query = query.join(Passport, ContentAsset.id == Passport.asset_id)
    assets = query.all()

    facts = db.query(Fact).filter(Fact.org_id == guideline.org_id).all()

    assets_newly_noncompliant = 0
    assets_newly_compliant = 0
    violations_added = 0
    violations_cleared = 0
    unchanged_violations = 0

    newly_flagged: List[Dict[str, Any]] = []
    newly_cleared: List[Dict[str, Any]] = []

    for asset in assets:
        body = asset.body
        if asset.revisions:
            sorted_revs = sorted(asset.revisions, key=lambda r: r.revision, reverse=True)
            body = sorted_revs[0].body

        passport_code = asset.passport.id if asset.passport else None

        active_findings = run_deterministic_rules(body, active_version, facts) if active_version else []
        proposed_findings = run_deterministic_rules(body, proposed_version, facts)

        active_fps = {_finding_fingerprint(f): f for f in active_findings}
        proposed_fps = {_finding_fingerprint(f): f for f in proposed_findings}

        added_fps = set(proposed_fps.keys()) - set(active_fps.keys())
        cleared_fps = set(active_fps.keys()) - set(proposed_fps.keys())
        common_fps = set(proposed_fps.keys()) & set(active_fps.keys())

        violations_added += len(added_fps)
        violations_cleared += len(cleared_fps)
        unchanged_violations += len(common_fps)

        # Asset compliance transition
        # Noncompliant means having high severity findings or rule violations
        had_active_violations = len(active_findings) > 0
        has_proposed_violations = len(proposed_findings) > 0

        if not had_active_violations and has_proposed_violations:
            assets_newly_noncompliant += 1
        elif had_active_violations and not has_proposed_violations:
            assets_newly_compliant += 1

        for fp in added_fps:
            f = proposed_fps[fp]
            newly_flagged.append({
                "asset_id": asset.id,
                "title": asset.title,
                "status": asset.status,
                "passport_code": passport_code,
                "rule_id": f.get("rule_id"),
                "quote": f.get("quote"),
                "severity": f.get("severity", "high"),
            })

        for fp in cleared_fps:
            f = active_fps[fp]
            newly_cleared.append({
                "asset_id": asset.id,
                "title": asset.title,
                "status": asset.status,
                "passport_code": passport_code,
                "rule_id": f.get("rule_id"),
                "quote": f.get("quote"),
                "severity": f.get("severity", "high"),
            })

    active_v_num = active_version.version if active_version else 0
    summary = {
        "assets_newly_noncompliant": assets_newly_noncompliant,
        "assets_newly_compliant": assets_newly_compliant,
        "violations_added": violations_added,
        "violations_cleared": violations_cleared,
        "unchanged_violations": unchanged_violations,
    }

    result = {
        "guideline_id": guideline.id,
        "active_version": active_v_num,
        "proposed_version": proposed_version.version,
        "scope": scope,
        "ran_at": now.isoformat(),
        "assets_checked": len(assets),
        "summary": summary,
        "newly_flagged": newly_flagged,
        "newly_cleared": newly_cleared,
    }

    # Store replay result
    existing_replay = (
        db.query(ReplayRun)
        .filter(
            ReplayRun.guideline_id == guideline.id,
            ReplayRun.version == proposed_version.version,
        )
        .first()
    )
    if existing_replay:
        existing_replay.active_version = active_v_num
        existing_replay.proposed_version = proposed_version.version
        existing_replay.scope = scope
        existing_replay.ran_at = now
        existing_replay.assets_checked = len(assets)
        existing_replay.summary = summary
        existing_replay.newly_flagged = newly_flagged
        existing_replay.newly_cleared = newly_cleared
    else:
        new_replay = ReplayRun(
            guideline_id=guideline.id,
            version=proposed_version.version,
            active_version=active_v_num,
            proposed_version=proposed_version.version,
            scope=scope,
            ran_at=now,
            assets_checked=len(assets),
            summary=summary,
            newly_flagged=newly_flagged,
            newly_cleared=newly_cleared,
        )
        db.add(new_replay)

    db.commit()
    return result
