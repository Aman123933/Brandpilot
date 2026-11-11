from datetime import datetime, timezone
from typing import Optional, List, Any
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from backend.app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    guidelines = relationship("Guideline", back_populates="organization", cascade="all, delete-orphan")
    facts = relationship("Fact", back_populates="organization", cascade="all, delete-orphan")
    assets = relationship("ContentAsset", back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    role = Column(String(50), nullable=False)
    password_hash = Column(String(255), nullable=True)
    salt = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="users")


class Guideline(Base):
    __tablename__ = "guidelines"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="guidelines")
    owner = relationship("User")
    versions = relationship(
        "GuidelineVersion",
        back_populates="guideline",
        cascade="all, delete-orphan",
        order_by="desc(GuidelineVersion.version)",
    )


class GuidelineVersion(Base):
    __tablename__ = "guideline_versions"

    id = Column(Integer, primary_key=True, index=True)
    guideline_id = Column(Integer, ForeignKey("guidelines.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    body = Column(Text, nullable=False)
    rules = Column(JSON, nullable=False, default=dict)
    change_note = Column(Text, nullable=True)
    status = Column(String(20), default="active", nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    guideline = relationship("Guideline", back_populates="versions")
    created_by = relationship("User", foreign_keys=[created_by_id])

    __table_args__ = (
        UniqueConstraint("guideline_id", "version", name="uq_guideline_version"),
    )


class Fact(Base):
    __tablename__ = "facts"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String(100), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="facts")
    owner = relationship("User")
    versions = relationship(
        "FactVersion",
        back_populates="fact",
        cascade="all, delete-orphan",
        order_by="desc(FactVersion.version)",
    )

    __table_args__ = (
        UniqueConstraint("org_id", "key", name="uq_org_fact_key"),
    )


class FactVersion(Base):
    __tablename__ = "fact_versions"

    id = Column(Integer, primary_key=True, index=True)
    fact_id = Column(Integer, ForeignKey("facts.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    value = Column(Text, nullable=False)
    unit = Column(String(50), nullable=True)
    valid_from = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    valid_until = Column(DateTime(timezone=True), nullable=True)
    is_current = Column(Boolean, default=True, nullable=False, index=True)
    source_note = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    fact = relationship("Fact", back_populates="versions")
    creator = relationship("User")

    __table_args__ = (
        UniqueConstraint("fact_id", "version", name="uq_fact_version"),
    )


class ContentAsset(Base):
    __tablename__ = "content_assets"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    body = Column(Text, nullable=False)
    source_filename = Column(String(255), nullable=True)
    status = Column(String(50), default="draft", nullable=False)
    current_revision = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    organization = relationship("Organization", back_populates="assets")
    creator = relationship("User")
    revisions = relationship(
        "AssetRevision",
        back_populates="asset",
        cascade="all, delete-orphan",
        order_by="desc(AssetRevision.revision)",
    )
    findings = relationship("Finding", back_populates="asset", cascade="all, delete-orphan")
    approvals = relationship("Approval", back_populates="asset", cascade="all, delete-orphan", order_by="desc(Approval.decided_at)")
    passport = relationship("Passport", back_populates="asset", uselist=False, cascade="all, delete-orphan")
    fact_links = relationship("AssetFactLink", back_populates="asset", cascade="all, delete-orphan")
    guideline_links = relationship("AssetGuidelineLink", back_populates="asset", cascade="all, delete-orphan")


class AssetRevision(Base):
    __tablename__ = "asset_revisions"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("content_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    revision = Column(Integer, nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    asset = relationship("ContentAsset", back_populates="revisions")

    __table_args__ = (
        UniqueConstraint("asset_id", "revision", name="uq_asset_revision"),
    )


class Finding(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("content_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    revision = Column(Integer, nullable=False)
    rule_id = Column(String(50), nullable=True)
    kind = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    quote = Column(Text, nullable=False)
    start_offset = Column(Integer, nullable=False)
    end_offset = Column(Integer, nullable=False)
    explanation = Column(Text, nullable=False)
    suggestion = Column(Text, nullable=True)
    source_type = Column(String(20), nullable=False)
    source_ref = Column(Integer, nullable=True)
    status = Column(String(20), default="open", nullable=False)
    origin = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    asset = relationship("ContentAsset", back_populates="findings")


class Approval(Base):
    __tablename__ = "approvals"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("content_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    revision = Column(Integer, nullable=False)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    decision = Column(String(50), nullable=False)
    comment = Column(Text, nullable=True)
    decided_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    asset = relationship("ContentAsset", back_populates="approvals")
    reviewer = relationship("User")


class AssetFactLink(Base):
    __tablename__ = "asset_fact_links"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("content_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    fact_version_id = Column(Integer, ForeignKey("fact_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    asset = relationship("ContentAsset", back_populates="fact_links")
    fact_version = relationship("FactVersion")

    __table_args__ = (
        UniqueConstraint("asset_id", "fact_version_id", name="uq_asset_fact_link"),
    )


class AssetGuidelineLink(Base):
    __tablename__ = "asset_guideline_links"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("content_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    guideline_version_id = Column(Integer, ForeignKey("guideline_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    asset = relationship("ContentAsset", back_populates="guideline_links")
    guideline_version = relationship("GuidelineVersion")

    __table_args__ = (
        UniqueConstraint("asset_id", "guideline_version_id", name="uq_asset_guideline_link"),
    )


class Passport(Base):
    __tablename__ = "passports"

    id = Column(String(32), primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("content_assets.id", ondelete="CASCADE"), unique=True, nullable=False)
    status = Column(String(50), default="valid", nullable=False)
    approved_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    approved_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    ai_disclosure = Column(Text, nullable=True)
    withdrawn_reason = Column(Text, nullable=True)
    withdrawn_at = Column(DateTime(timezone=True), nullable=True)
    withdrawn_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    asset = relationship("ContentAsset", back_populates="passport")
    approver = relationship("User", foreign_keys=[approved_by])
    withdrawn_by_user = relationship("User", foreign_keys=[withdrawn_by])


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    asset_id = Column(Integer, ForeignKey("content_assets.id", ondelete="CASCADE"), nullable=True)
    fact_version_id = Column(Integer, ForeignKey("fact_versions.id", ondelete="CASCADE"), nullable=True, index=True)
    read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    entity = Column(String(100), nullable=False)
    entity_id = Column(String(100), nullable=True)
    detail = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    organization = relationship("Organization")
    actor = relationship("User")


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    attempted_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    success = Column(Boolean, default=False, nullable=False)


class ReplayRun(Base):
    __tablename__ = "replay_runs"

    id = Column(Integer, primary_key=True, index=True)
    guideline_id = Column(Integer, ForeignKey("guidelines.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False, index=True)
    active_version = Column(Integer, nullable=False)
    proposed_version = Column(Integer, nullable=False)
    scope = Column(String(20), default="approved", nullable=False)
    ran_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    assets_checked = Column(Integer, default=0, nullable=False)
    summary = Column(JSON, nullable=False, default=dict)
    newly_flagged = Column(JSON, nullable=False, default=list)
    newly_cleared = Column(JSON, nullable=False, default=list)

    guideline = relationship("Guideline")


class ExpiryRun(Base):
    __tablename__ = "expiry_runs"

    id = Column(Integer, primary_key=True, index=True)
    ran_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    source = Column(String(50), default="manual", nullable=False)
    affected_assets_count = Column(Integer, default=0, nullable=False)
    details = Column(JSON, nullable=True)


class AiCache(Base):
    __tablename__ = "ai_cache"

    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String(64), unique=True, index=True, nullable=False)
    task_type = Column(String(50), nullable=False)
    response_json = Column(JSON, nullable=False)
    model_used = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class AiCallLog(Base):
    __tablename__ = "ai_call_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    called_at = Column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
