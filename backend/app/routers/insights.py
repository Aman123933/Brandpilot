from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, distinct

from backend.app.database import get_db
from backend.app.models import (
    User,
    ContentAsset,
    Passport,
    Finding,
    Approval,
    AssetFactLink,
    FactVersion,
    Fact,
    ActivityLog,
)
from backend.app.schemas import (
    InsightsOverviewResponse,
    InsightsTotals,
    OutdatedContentItem,
    InsightsViolationsResponse,
    TopRuleItem,
    ViolationsByDayItem,
    ViolationsByCreatorItem,
    DisputedRuleItem,
    InsightsAssetItem,
)
from backend.app.auth import require_roles

router = APIRouter(prefix="/insights", tags=["Insights"])


@router.get("/overview", response_model=InsightsOverviewResponse)
def get_insights_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager", "reviewer")),
):
    now = datetime.now(timezone.utc)
    org_id = current_user.org_id

    # 1. Total assets breakdown using SQL aggregation
    counts_query = (
        db.query(
            func.count(ContentAsset.id).label("total"),
            func.count(case((ContentAsset.status == "draft", 1))).label("drafts"),
            func.count(case((ContentAsset.status == "in_review", 1))).label("in_review"),
        )
        .filter(ContentAsset.org_id == org_id)
        .first()
    )
    total_assets = counts_query.total if counts_query else 0
    drafts_count = counts_query.drafts if counts_query else 0
    in_review_count = counts_query.in_review if counts_query else 0

    # Passport status counts
    passport_counts = (
        db.query(
            func.count(case((Passport.status == "valid", 1))).label("valid_count"),
            func.count(case((Passport.status == "review_required", 1))).label("review_required_count"),
            func.count(case((Passport.status == "withdrawn", 1))).label("withdrawn_count"),
            func.count(Passport.id).label("total_passports"),
        )
        .join(ContentAsset, Passport.asset_id == ContentAsset.id)
        .filter(ContentAsset.org_id == org_id)
        .first()
    )

    approved_valid = passport_counts.valid_count if passport_counts else 0
    review_required = passport_counts.review_required_count if passport_counts else 0
    withdrawn = passport_counts.withdrawn_count if passport_counts else 0
    total_passports = passport_counts.total_passports if passport_counts else 0

    totals = InsightsTotals(
        assets=total_assets,
        approved_valid=approved_valid,
        review_required=review_required,
        in_review=in_review_count,
        drafts=drafts_count,
        withdrawn=withdrawn,
    )

    # compliance_rate = assets with a valid passport / assets that have ever received a passport
    compliance_rate = round(approved_valid / total_passports, 2) if total_passports > 0 else None

    # pending_approvals = assets with status in_review
    pending_approvals = in_review_count

    # avg_hours_to_decision
    # Calculate difference between approval decided_at and asset created_at
    approvals = (
        db.query(Approval.decided_at, ContentAsset.created_at)
        .join(ContentAsset, Approval.asset_id == ContentAsset.id)
        .filter(ContentAsset.org_id == org_id)
        .all()
    )
    if approvals:
        total_seconds = sum(
            (appr_time - asset_time).total_seconds()
            for appr_time, asset_time in approvals
            if appr_time >= asset_time
        )
        avg_hours = round((total_seconds / len(approvals)) / 3600.0, 1)
    else:
        avg_hours = None

    # outdated_content (max 20)
    # Assets with review_required passport or linked to outdated/recalled facts
    outdated_items: List[OutdatedContentItem] = []
    outdated_rows = (
        db.query(
            ContentAsset.id,
            ContentAsset.title,
            User.name.label("owner_name"),
            Passport.id.label("passport_code"),
            Fact.key.label("fact_key"),
        )
        .join(User, ContentAsset.creator_id == User.id)
        .join(Passport, ContentAsset.id == Passport.asset_id)
        .join(AssetFactLink, ContentAsset.id == AssetFactLink.asset_id)
        .join(FactVersion, AssetFactLink.fact_version_id == FactVersion.id)
        .join(Fact, FactVersion.fact_id == Fact.id)
        .filter(
            ContentAsset.org_id == org_id,
            (Passport.status == "review_required") | (FactVersion.is_current == False),
        )
        .distinct()
        .limit(20)
        .all()
    )

    for r in outdated_rows:
        outdated_items.append(
            OutdatedContentItem(
                asset_id=r.id,
                title=r.title,
                owner_name=r.owner_name or "Unknown",
                passport_code=r.passport_code,
                fact_key=r.fact_key or "fact",
                reason="Fact changed or requires revalidation",
            )
        )

    # findings_by_kind & findings_by_severity via SQL group by
    kind_counts = (
        db.query(Finding.kind, func.count(Finding.id))
        .join(ContentAsset, Finding.asset_id == ContentAsset.id)
        .filter(ContentAsset.org_id == org_id)
        .group_by(Finding.kind)
        .all()
    )
    findings_by_kind = {k: count for k, count in kind_counts}
    findings_by_kind.setdefault("rule_violation", 0)
    findings_by_kind.setdefault("fact_mismatch", 0)
    findings_by_kind.setdefault("unsupported_claim", 0)

    severity_counts = (
        db.query(Finding.severity, func.count(Finding.id))
        .join(ContentAsset, Finding.asset_id == ContentAsset.id)
        .filter(ContentAsset.org_id == org_id)
        .group_by(Finding.severity)
        .all()
    )
    findings_by_severity = {s: count for s, count in severity_counts}
    findings_by_severity.setdefault("high", 0)
    findings_by_severity.setdefault("medium", 0)
    findings_by_severity.setdefault("low", 0)

    return InsightsOverviewResponse(
        generated_at=now,
        totals=totals,
        compliance_rate=compliance_rate,
        pending_approvals=pending_approvals,
        avg_hours_to_decision=avg_hours,
        outdated_content=outdated_items,
        findings_by_kind=findings_by_kind,
        findings_by_severity=findings_by_severity,
    )


@router.get("/violations", response_model=InsightsViolationsResponse)
def get_insights_violations(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager", "reviewer")),
):
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)
    org_id = current_user.org_id

    # top_rules: up to 10 rows, most frequent first
    top_rule_rows = (
        db.query(
            Finding.rule_id,
            Finding.kind,
            Finding.quote,
            func.count(Finding.id).label("count"),
        )
        .join(ContentAsset, Finding.asset_id == ContentAsset.id)
        .filter(
            ContentAsset.org_id == org_id,
            Finding.created_at >= start_date,
        )
        .group_by(Finding.rule_id, Finding.kind, Finding.quote)
        .order_by(func.count(Finding.id).desc())
        .limit(10)
        .all()
    )

    top_rules = [
        TopRuleItem(
            rule_id=r.rule_id,
            label=r.quote if r.quote else (r.rule_id or r.kind),
            kind=r.kind,
            count=r.count,
        )
        for r in top_rule_rows
    ]

    # by_day: includes zero-count days so charts have no gaps, oldest first
    counts_by_day_raw = (
        db.query(
            func.date(Finding.created_at).label("day"),
            func.count(Finding.id).label("count"),
        )
        .join(ContentAsset, Finding.asset_id == ContentAsset.id)
        .filter(
            ContentAsset.org_id == org_id,
            Finding.created_at >= start_date,
        )
        .group_by(func.date(Finding.created_at))
        .all()
    )
    counts_map = {str(r.day): r.count for r in counts_by_day_raw}

    by_day: List[ViolationsByDayItem] = []
    cur = (start_date).date()
    end_d = now.date()
    while cur <= end_d:
        d_str = cur.isoformat()
        by_day.append(ViolationsByDayItem(date=d_str, count=counts_map.get(d_str, 0)))
        cur += timedelta(days=1)

    # by_creator
    by_creator_rows = (
        db.query(
            User.id.label("user_id"),
            User.name.label("name"),
            func.count(Finding.id).label("count"),
        )
        .join(ContentAsset, Finding.asset_id == ContentAsset.id)
        .join(User, ContentAsset.creator_id == User.id)
        .filter(
            ContentAsset.org_id == org_id,
            Finding.created_at >= start_date,
        )
        .group_by(User.id, User.name)
        .order_by(func.count(Finding.id).desc())
        .all()
    )
    by_creator = [
        ViolationsByCreatorItem(user_id=r.user_id, name=r.name, count=r.count)
        for r in by_creator_rows
    ]

    return InsightsViolationsResponse(
        days=days,
        top_rules=top_rules,
        by_day=by_day,
        by_creator=by_creator,
    )


@router.get("/disputed-rules", response_model=List[DisputedRuleItem])
def get_disputed_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager", "reviewer")),
):
    """
    A dispute = a finding for that rule that a creator marked 'dismissed'.
    Sorted by dispute_rate desc then raised desc. Only rules with raised >= 1.
    """
    org_id = current_user.org_id

    rows = (
        db.query(
            Finding.rule_id,
            Finding.quote.label("label"),
            func.count(Finding.id).label("raised"),
            func.count(case((Finding.status == "dismissed", 1))).label("dismissed"),
        )
        .join(ContentAsset, Finding.asset_id == ContentAsset.id)
        .filter(ContentAsset.org_id == org_id, Finding.rule_id != None)
        .group_by(Finding.rule_id, Finding.quote)
        .all()
    )

    items: List[DisputedRuleItem] = []
    for r in rows:
        raised = r.raised
        dismissed = r.dismissed
        if raised >= 1:
            rate = round(dismissed / raised, 2)
            items.append(
                DisputedRuleItem(
                    rule_id=r.rule_id,
                    label=r.label or r.rule_id,
                    raised=raised,
                    dismissed=dismissed,
                    dispute_rate=rate,
                )
            )

    items.sort(key=lambda x: (x.dispute_rate, x.raised), reverse=True)
    return items


@router.get("/assets", response_model=List[InsightsAssetItem])
def get_insights_assets(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("brand_manager", "reviewer")),
):
    """
    Returns asset compliance overview:
    non_compliant = open high-severity findings or passport review_required/withdrawn
    at_risk = only medium/low open findings
    compliant = audited with nothing open
    unknown = never audited
    """
    org_id = current_user.org_id

    assets = (
        db.query(ContentAsset)
        .filter(ContentAsset.org_id == org_id)
        .order_by(ContentAsset.id)
        .all()
    )

    items: List[InsightsAssetItem] = []
    for asset in assets:
        passport_status = asset.passport.status if asset.passport else None

        findings = asset.findings or []
        audited = len(findings) > 0
        last_audit = max((f.created_at for f in findings), default=None) if audited else None

        open_findings = [f for f in findings if f.status == "open"]
        open_high = sum(1 for f in open_findings if f.severity == "high")
        open_total = len(open_findings)

        if not audited:
            compliance = "unknown"
        elif open_high > 0 or passport_status in ("review_required", "withdrawn"):
            compliance = "non_compliant"
        elif open_total > 0:
            compliance = "at_risk"
        else:
            compliance = "compliant"

        items.append(
            InsightsAssetItem(
                asset_id=asset.id,
                title=asset.title,
                status=asset.status,
                passport_status=passport_status,
                open_high=open_high,
                open_total=open_total,
                last_audited_at=last_audit,
                compliance=compliance,
            )
        )

    return items
