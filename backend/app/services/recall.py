import re
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.app.models import (
    Fact,
    FactVersion,
    ContentAsset,
    AssetFactLink,
    Passport,
    Notification,
    ActivityLog,
    User,
    ExpiryRun,
)
from backend.app.schemas import ImpactPreviewItem, ImpactPreviewResponse


def _is_expired(valid_until: Optional[datetime]) -> bool:
    if not valid_until:
        return False
    now = datetime.now(timezone.utc)
    if valid_until.tzinfo is None:
        valid_until = valid_until.replace(tzinfo=timezone.utc)
    return valid_until < now


def find_matching_sentence(text: str, value: str, key: str = "") -> str:
    """Find the specific sentence in the text where the fact or value appears."""
    if not text:
        return ""

    sentences = re.split(r"(?<=[.!?])\s+|\n+", text)
    val_clean = str(value).strip()

    # 1. Whole-word match for value
    if val_clean:
        pattern = re.compile(rf"\b{re.escape(val_clean)}\b", re.IGNORECASE)
        for s in sentences:
            if pattern.search(s):
                return s.strip()

    # 2. Key-based match with value
    topic = key.split("_")[0] if key else ""
    if topic:
        for s in sentences:
            if topic.lower() in s.lower() and val_clean in s:
                return s.strip()

    # 3. Substring match for value
    for s in sentences:
        if val_clean in s:
            return s.strip()

    # 4. Fallback to topic alone
    if topic:
        for s in sentences:
            if topic.lower() in s.lower():
                return s.strip()

    return sentences[0].strip() if sentences else text.strip()


def suggest_corrected_sentence(sentence: str, old_value: str, new_value: str) -> str:
    """Create a suggested replacement sentence with the new value substituted."""
    if not sentence:
        return ""
    old_clean = str(old_value).strip()
    new_clean = str(new_value).strip()

    # Try word-boundary replacement
    pattern = re.compile(rf"\b{re.escape(old_clean)}\b", re.IGNORECASE)
    replaced, count = pattern.subn(new_clean, sentence)
    if count > 0:
        return replaced

    # Fallback to simple replace
    if old_clean in sentence:
        return sentence.replace(old_clean, new_clean, 1)

    return f"{sentence} (Updated to {new_clean})"


def get_fact_impact_preview(
    db: Session,
    fact_id: int,
    new_value: str,
    org_id: int,
) -> ImpactPreviewResponse:
    """Preview which approved assets will be impacted by changing a fact value, without making DB changes."""
    fact = (
        db.query(Fact)
        .filter(Fact.id == fact_id, Fact.org_id == org_id)
        .first()
    )
    if not fact:
        return ImpactPreviewResponse(
            fact_id=fact_id,
            fact_key="unknown",
            old_value="",
            new_value=new_value,
            affected_assets_count=0,
            affected_assets=[],
        )

    current_v = next((v for v in fact.versions if v.is_current), None)
    old_val = current_v.value if current_v else ""

    # Find all assets linked to current or past versions of this fact
    fact_version_ids = [v.id for v in fact.versions]
    links = (
        db.query(AssetFactLink)
        .filter(AssetFactLink.fact_version_id.in_(fact_version_ids))
        .all()
    )

    seen_asset_ids = set()
    affected: List[ImpactPreviewItem] = []

    for link in links:
        if link.asset_id in seen_asset_ids:
            continue
        seen_asset_ids.add(link.asset_id)

        asset = (
            db.query(ContentAsset)
            .filter(ContentAsset.id == link.asset_id, ContentAsset.org_id == org_id)
            .first()
        )
        if not asset:
            continue

        owner_user = db.query(User).filter(User.id == asset.creator_id).first()
        owner_name = owner_user.name if owner_user else f"User {asset.creator_id}"
        passport_code = asset.passport.id if asset.passport else None

        matching_sentence = find_matching_sentence(asset.body, old_val, fact.key)
        suggested = suggest_corrected_sentence(matching_sentence, old_val, new_value)

        affected.append(
            ImpactPreviewItem(
                asset_id=asset.id,
                title=asset.title,
                owner=owner_name,
                passport_code=passport_code,
                old_value=old_val,
                new_value=new_value,
                matching_sentence=matching_sentence,
                suggested_sentence=suggested,
            )
        )

    return ImpactPreviewResponse(
        fact_id=fact.id,
        fact_key=fact.key,
        old_value=old_val,
        new_value=new_value,
        affected_assets_count=len(affected),
        affected_assets=affected,
    )


def recall_for_fact_version(
    db: Session,
    new_fact_version_id: int,
    actor_id: Optional[int] = None,
) -> List[ImpactPreviewItem]:
    """
    Core Recall Logic:
    When a new FactVersion is created, finds every approved asset linked to any older version
    of that fact, marks passports 'review_required', transitions asset status to 'needs_revalidation',
    notifies owners, logs activity, and returns affected assets.
    """
    new_fv = db.query(FactVersion).filter(FactVersion.id == new_fact_version_id).first()
    if not new_fv:
        return []

    fact = db.query(Fact).filter(Fact.id == new_fv.fact_id).first()
    if not fact:
        return []

    # Get older versions of this fact
    older_versions = [v for v in fact.versions if v.id != new_fv.id]
    if not older_versions:
        return []

    older_v_ids = [v.id for v in older_versions]
    prev_v = next(
        (v for v in sorted(older_versions, key=lambda x: x.version, reverse=True)),
        older_versions[0],
    )
    old_val = prev_v.value
    new_val = new_fv.value

    # Find assets linked to any older version of this fact
    links = (
        db.query(AssetFactLink)
        .filter(AssetFactLink.fact_version_id.in_(older_v_ids))
        .all()
    )

    now = datetime.now(timezone.utc)
    seen_asset_ids = set()
    affected_items: List[ImpactPreviewItem] = []

    for link in links:
        if link.asset_id in seen_asset_ids:
            continue
        seen_asset_ids.add(link.asset_id)

        asset = db.query(ContentAsset).filter(ContentAsset.id == link.asset_id).first()
        if not asset:
            continue

        # Mark passport review_required
        if asset.passport:
            asset.passport.status = "review_required"

        # Update asset status
        asset.status = "needs_revalidation"
        asset.updated_at = now

        # Notify asset owner
        owner = db.query(User).filter(User.id == asset.creator_id).first()
        owner_name = owner.name if owner else f"User {asset.creator_id}"
        notification_msg = (
            f"Fact '{fact.key}' updated from '{old_val}' to '{new_val}'. "
            f"Your approved asset '{asset.title}' requires revalidation."
        )
        db.add(
            Notification(
                user_id=asset.creator_id,
                message=notification_msg,
                asset_id=asset.id,
                read=False,
                created_at=now,
            )
        )

        # Log Activity
        db.add(
            ActivityLog(
                org_id=fact.org_id,
                actor_id=actor_id,
                action="fact_recall_triggered",
                entity="asset",
                entity_id=str(asset.id),
                detail={
                    "fact_id": fact.id,
                    "fact_key": fact.key,
                    "old_version": prev_v.version,
                    "new_version": new_fv.version,
                    "old_value": old_val,
                    "new_value": new_val,
                },
                created_at=now,
            )
        )

        sentence = find_matching_sentence(asset.body, old_val, fact.key)
        suggested = suggest_corrected_sentence(sentence, old_val, new_val)

        affected_items.append(
            ImpactPreviewItem(
                asset_id=asset.id,
                title=asset.title,
                owner=owner_name,
                passport_code=asset.passport.id if asset.passport else None,
                old_value=old_val,
                new_value=new_val,
                matching_sentence=sentence,
                suggested_sentence=suggested,
            )
        )

    return affected_items


_last_lazy_check: Optional[datetime] = None


def lazy_throttled_check_expired_facts(db: Session):
    """Runs lazy throttled expiry check (max once per 10 minutes)."""
    global _last_lazy_check
    now = datetime.now(timezone.utc)
    if _last_lazy_check is None or (now - _last_lazy_check) > timedelta(minutes=10):
        _last_lazy_check = now
        try:
            check_expired_facts(db, source="lazy")
        except Exception:
            pass


def check_expired_facts(
    db: Session,
    actor_id: Optional[int] = None,
    source: str = "manual",
) -> List[ImpactPreviewItem]:
    """Check for expired facts and recall any approved assets that rely on them."""
    now = datetime.now(timezone.utc)
    expired_versions = (
        db.query(FactVersion)
        .filter(FactVersion.is_current == True, FactVersion.valid_until != None)
        .all()
    )
    expired_versions = [v for v in expired_versions if _is_expired(v.valid_until)]

    seen_asset_ids = set()
    affected_items: List[ImpactPreviewItem] = []

    if expired_versions:
        for fv in expired_versions:
            fact = db.query(Fact).filter(Fact.id == fv.fact_id).first()
            if not fact:
                continue

            links = (
                db.query(AssetFactLink)
                .filter(AssetFactLink.fact_version_id == fv.id)
                .all()
            )

            for link in links:
                if link.asset_id in seen_asset_ids:
                    continue
                seen_asset_ids.add(link.asset_id)

                asset = db.query(ContentAsset).filter(ContentAsset.id == link.asset_id).first()
                if not asset or not asset.passport or asset.passport.status != "valid":
                    continue

                asset.passport.status = "review_required"
                asset.status = "needs_revalidation"
                asset.updated_at = now

                owner = db.query(User).filter(User.id == asset.creator_id).first()
                owner_name = owner.name if owner else f"User {asset.creator_id}"

                # Only notify each owner once per fact version (no duplicate notifications)
                existing_notif = (
                    db.query(Notification)
                    .filter(
                        Notification.user_id == asset.creator_id,
                        Notification.fact_version_id == fv.id,
                    )
                    .first()
                )
                if not existing_notif:
                    notification_msg = (
                        f"Fact '{fact.key}' expired on {fv.valid_until.strftime('%Y-%m-%d')}. "
                        f"Your approved asset '{asset.title}' requires revalidation."
                    )
                    db.add(
                        Notification(
                            user_id=asset.creator_id,
                            message=notification_msg,
                            asset_id=asset.id,
                            fact_version_id=fv.id,
                            read=False,
                            created_at=now,
                        )
                    )

                db.add(
                    ActivityLog(
                        org_id=fact.org_id,
                        actor_id=actor_id,
                        action="expired_fact_recall",
                        entity="asset",
                        entity_id=str(asset.id),
                        detail={
                            "fact_id": fact.id,
                            "fact_key": fact.key,
                            "expired_version": fv.version,
                            "valid_until": fv.valid_until.isoformat(),
                        },
                        created_at=now,
                    )
                )

                sentence = find_matching_sentence(asset.body, fv.value, fact.key)
                affected_items.append(
                    ImpactPreviewItem(
                        asset_id=asset.id,
                        title=asset.title,
                        owner=owner_name,
                        passport_code=asset.passport.id,
                        old_value=fv.value,
                        new_value="[EXPIRED]",
                        matching_sentence=sentence,
                        suggested_sentence=None,
                    )
                )

    expiry_run = ExpiryRun(
        ran_at=now,
        source=source,
        affected_assets_count=len(affected_items),
        details={"affected_asset_ids": [item.asset_id for item in affected_items]},
    )
    db.add(expiry_run)
    db.commit()

    return affected_items
