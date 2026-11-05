from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    id: int
    org_id: int
    name: str
    email: str
    role: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DemoLoginRequest(BaseModel):
    user_id: int


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class BannedTermRule(BaseModel):
    term: str = Field(..., description="Banned term or phrase")
    why: str = Field(..., description="Reason why the term is disallowed")
    preferred: str = Field(..., description="Preferred alternative")


class ClaimRule(BaseModel):
    pattern: str = Field(..., description="Regex or text pattern that signals a claim, e.g. '% better' or '#1'")
    requires_fact_key: Optional[str] = Field(None, description="Key of the Fact that must back this claim")


class GuidelineRules(BaseModel):
    banned_terms: List[BannedTermRule] = Field(default_factory=list)
    required_phrases: List[str] = Field(default_factory=list)
    tone_notes: List[str] = Field(default_factory=list)
    claim_rules: List[ClaimRule] = Field(default_factory=list)


class GuidelineVersionOut(BaseModel):
    id: int
    guideline_id: int
    version: int
    body: str
    rules: GuidelineRules
    created_at: datetime
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class GuidelineCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    body: str = Field(..., min_length=1)
    rules: GuidelineRules = Field(default_factory=GuidelineRules)


class GuidelineVersionCreate(BaseModel):
    body: str = Field(..., min_length=1)
    rules: GuidelineRules = Field(default_factory=GuidelineRules)
    is_active: bool = True


class GuidelineOut(BaseModel):
    id: int
    org_id: int
    title: str
    owner_id: int
    created_at: datetime
    current_version: Optional[GuidelineVersionOut] = None

    model_config = ConfigDict(from_attributes=True)


class GuidelineDetailOut(GuidelineOut):
    versions: List[GuidelineVersionOut] = Field(default_factory=list)


class ImpactPreviewItem(BaseModel):
    asset_id: int
    title: str
    owner: str
    passport_code: Optional[str] = None
    old_value: str
    new_value: str
    matching_sentence: str
    suggested_sentence: Optional[str] = None


class FactVersionOut(BaseModel):
    id: int
    fact_id: int
    version: int
    value: str
    unit: Optional[str] = None
    valid_from: datetime
    valid_until: Optional[datetime] = None
    is_current: bool
    source_note: Optional[str] = None
    created_by: int
    created_at: datetime
    affected_assets: List[ImpactPreviewItem] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class FactCreate(BaseModel):
    key: str = Field(..., min_length=2, max_length=100, pattern=r"^[a-zA-Z0-9_\-]+$")
    value: str = Field(..., min_length=1)
    unit: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    source_note: Optional[str] = None


class FactVersionCreate(BaseModel):
    value: str = Field(..., min_length=1)
    unit: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    source_note: Optional[str] = None


class FactOut(BaseModel):
    id: int
    org_id: int
    key: str
    owner_id: int
    created_at: datetime
    current_version: Optional[FactVersionOut] = None

    model_config = ConfigDict(from_attributes=True)


class FactDetailOut(FactOut):
    versions: List[FactVersionOut] = Field(default_factory=list)


class AssetRevisionOut(BaseModel):
    id: int
    asset_id: int
    revision: int
    body: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ContentAssetCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)
    source_filename: Optional[str] = None


class ContentAssetOut(BaseModel):
    id: int
    org_id: int
    title: str
    creator_id: int
    body: str
    source_filename: Optional[str] = None
    status: str
    current_revision: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ContentAssetDetailOut(ContentAssetOut):
    revisions: List[AssetRevisionOut] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    database: str = "connected"
    timestamp: datetime


class FindingOut(BaseModel):
    id: int
    asset_id: int
    revision: int
    kind: str
    severity: str
    quote: str
    start_offset: int
    end_offset: int
    explanation: str
    suggestion: Optional[str] = None
    source_type: str
    source_ref: Optional[int] = None
    status: str
    origin: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FindingUpdate(BaseModel):
    status: str = Field(..., pattern=r"^(accepted|dismissed)$")


class FindingPatchResponse(BaseModel):
    finding: FindingOut
    new_revision: Optional[int] = None
    new_body: Optional[str] = None
    new_findings_count: Optional[int] = None


class AuditGroupedFindings(BaseModel):
    high: List[FindingOut] = Field(default_factory=list)
    medium: List[FindingOut] = Field(default_factory=list)
    low: List[FindingOut] = Field(default_factory=list)


class AuditResponse(BaseModel):
    asset_id: int
    revision: int
    ai_available: bool
    total_findings: int
    findings: AuditGroupedFindings


class RedTeamFinding(BaseModel):
    persona: str  # critical_journalist | competitor | skeptical_customer
    category: str  # misleading | unsupported_promise | reputational | ambiguity
    severity: str  # high | medium | low
    quote: str
    start_offset: Optional[int] = None
    end_offset: Optional[int] = None
    why: str
    label: str = "potential risks"


class RedTeamResponse(BaseModel):
    asset_id: int
    revision: int
    ai_available: bool
    risks: List[RedTeamFinding] = Field(default_factory=list)


class SubmitForReviewResponse(BaseModel):
    asset_id: int
    status: str
    current_revision: int
    message: str
    warnings: List[str] = Field(default_factory=list)


class ReviewQueueItem(BaseModel):
    asset_id: int
    title: str
    creator_id: int
    creator_name: str
    status: str
    current_revision: int
    open_findings_count: int
    high_severity_findings_count: int
    passport_code: Optional[str] = None
    passport_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class DecisionRequest(BaseModel):
    decision: str = Field(..., pattern=r"^(approved|rejected|changes_requested)$")
    comment: Optional[str] = None


class DecisionResponse(BaseModel):
    asset_id: int
    status: str
    revision: int
    decision: str
    passport_code: Optional[str] = None
    message: str


class PublicPassportOut(BaseModel):
    code: str
    asset_title: str
    status: str
    approved_at: Optional[datetime] = None
    reviewer_first_name: Optional[str] = None
    guideline_version_label: str
    linked_facts_count: int
    ai_disclosure: Optional[str] = None


class FullPassportOut(BaseModel):
    code: str
    asset_id: int
    asset_title: str
    asset_status: str
    status: str
    approved_at: Optional[datetime] = None
    approved_by_name: Optional[str] = None
    ai_disclosure: Optional[str] = None
    created_at: datetime
    guideline_version: Optional[Dict[str, Any]] = None
    referenced_facts: List[Dict[str, Any]] = Field(default_factory=list)
    revisions: List[AssetRevisionOut] = Field(default_factory=list)
    approvals: List[Dict[str, Any]] = Field(default_factory=list)
    activity_log: List[Dict[str, Any]] = Field(default_factory=list)


class ImpactPreviewResponse(BaseModel):
    fact_id: int
    fact_key: str
    old_value: str
    new_value: str
    affected_assets_count: int
    affected_assets: List[ImpactPreviewItem] = Field(default_factory=list)


class NotificationOut(BaseModel):
    id: int
    user_id: int
    message: str
    asset_id: Optional[int] = None
    read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssetHistoryOut(BaseModel):
    asset_id: int
    title: str
    status: str
    current_revision: int
    revisions: List[AssetRevisionOut] = Field(default_factory=list)
    approvals: List[Dict[str, Any]] = Field(default_factory=list)
    findings: List[FindingOut] = Field(default_factory=list)
    activity_logs: List[Dict[str, Any]] = Field(default_factory=list)


class ExpiryCheckResponse(BaseModel):
    checked_at: datetime
    affected_assets_count: int
    affected_assets: List[ImpactPreviewItem] = Field(default_factory=list)
