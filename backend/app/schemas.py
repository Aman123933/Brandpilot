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


class UserBriefOut(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: str
    password: str


class DemoCredentialOut(BaseModel):
    name: str
    email: str
    password: str
    role: str
    description: str


class DemoLoginRequest(BaseModel):
    user_id: int


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class BannedTermRule(BaseModel):
    id: Optional[str] = Field(None, description="Stable rule id e.g. BT-001")
    term: str = Field(..., description="Banned term or phrase")
    why: str = Field(..., description="Reason why the term is disallowed")
    preferred: str = Field(..., description="Preferred alternative")
    owner_id: Optional[int] = Field(None, description="Rule owner user ID")


class RequiredPhraseRule(BaseModel):
    id: Optional[str] = Field(None, description="Stable rule id e.g. RP-001")
    phrase: str = Field(..., description="Mandatory phrase")
    why: Optional[str] = Field(None, description="Reason for phrase")
    owner_id: Optional[int] = Field(None, description="Rule owner user ID")


class ClaimRule(BaseModel):
    id: Optional[str] = Field(None, description="Stable rule id e.g. CR-001")
    pattern: str = Field(..., description="Regex or text pattern that signals a claim, e.g. '% better' or '#1'")
    requires_fact_key: Optional[str] = Field(None, description="Key of the Fact that must back this claim")
    why: Optional[str] = Field(None, description="Reason for claim rule")
    owner_id: Optional[int] = Field(None, description="Rule owner user ID")


class GuidelineRules(BaseModel):
    banned_terms: List[BannedTermRule] = Field(default_factory=list)
    required_phrases: List[Any] = Field(default_factory=list)
    tone_notes: List[str] = Field(default_factory=list)
    claim_rules: List[ClaimRule] = Field(default_factory=list)


class RulesSummary(BaseModel):
    banned_terms: int = 0
    required_phrases: int = 0
    claim_rules: int = 0


class ReplaySummaryBrief(BaseModel):
    ran_at: datetime
    assets_newly_noncompliant: int = 0
    assets_newly_compliant: int = 0


class GuidelineVersionListItem(BaseModel):
    id: int
    version: int
    status: str
    created_at: datetime
    created_by: Optional[UserBriefOut] = None
    change_note: Optional[str] = None
    rules_summary: RulesSummary
    latest_replay: Optional[ReplaySummaryBrief] = None

    model_config = ConfigDict(from_attributes=True)


class GuidelineVersionOut(BaseModel):
    id: int
    guideline_id: int
    version: int
    body: str
    rules: GuidelineRules
    created_at: datetime
    is_active: bool
    status: str = "active"
    change_note: Optional[str] = None
    created_by: Optional[UserBriefOut] = None
    rules_summary: Optional[RulesSummary] = None
    latest_replay: Optional[ReplaySummaryBrief] = None

    model_config = ConfigDict(from_attributes=True)


class GuidelineCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    body: str = Field(..., min_length=1)
    rules: GuidelineRules = Field(default_factory=GuidelineRules)


class GuidelineVersionCreate(BaseModel):
    body: str = Field(..., min_length=1)
    rules: GuidelineRules = Field(default_factory=GuidelineRules)
    is_active: Optional[bool] = False
    change_note: Optional[str] = None
    activate: bool = False


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


class DiffChange(BaseModel):
    kind: str  # added | removed | changed
    section: str  # banned_terms | required_phrases | claim_rules | tone_notes
    rule_id: Optional[str] = None
    before: Any = None
    after: Any = None


class DiffSummary(BaseModel):
    added: int = 0
    removed: int = 0
    changed: int = 0


class GuidelineDiffResponse(BaseModel):
    guideline_id: int
    from_version: int
    to_version: int
    summary: DiffSummary
    changes: List[DiffChange]


class ReplayRequest(BaseModel):
    scope: str = "approved"


class ReplayFlaggedItem(BaseModel):
    asset_id: int
    title: str
    status: str
    passport_code: Optional[str] = None
    rule_id: Optional[str] = None
    quote: str
    severity: str


class ReplaySummary(BaseModel):
    assets_newly_noncompliant: int = 0
    assets_newly_compliant: int = 0
    violations_added: int = 0
    violations_cleared: int = 0
    unchanged_violations: int = 0


class ReplayResponse(BaseModel):
    guideline_id: int
    active_version: int
    proposed_version: int
    scope: str
    ran_at: datetime
    assets_checked: int
    summary: ReplaySummary
    newly_flagged: List[ReplayFlaggedItem] = Field(default_factory=list)
    newly_cleared: List[ReplayFlaggedItem] = Field(default_factory=list)


class ActivateVersionRequest(BaseModel):
    note: Optional[str] = None


class ActivateVersionResponse(BaseModel):
    guideline_id: int
    version: int
    status: str
    previous_version: int
    assets_to_recheck: int


class RejectVersionRequest(BaseModel):
    note: str = Field(..., min_length=3)


class RejectVersionResponse(BaseModel):
    version: int
    status: str


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


class AiHealthInfo(BaseModel):
    configured: bool = False
    model: str = "gemini-3.8-flash"


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    database: str = "connected"
    timestamp: datetime
    database_engine: str = "sqlite"
    ai: AiHealthInfo = Field(default_factory=lambda: AiHealthInfo(configured=False, model="gemini-3.8-flash"))


class FindingOut(BaseModel):
    id: int
    asset_id: int
    revision: int
    rule_id: Optional[str] = None
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
    ai_message: Optional[str] = None
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
    ai_message: Optional[str] = None
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


class WithdrawPassportRequest(BaseModel):
    reason: str = Field(..., min_length=3)


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
    withdrawn_reason: Optional[str] = None
    withdrawn_at: Optional[datetime] = None
    withdrawn_by: Optional[str] = None
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


# Insights schemas
class InsightsTotals(BaseModel):
    assets: int
    approved_valid: int
    review_required: int
    in_review: int
    drafts: int
    withdrawn: int


class OutdatedContentItem(BaseModel):
    asset_id: int
    title: str
    owner_name: str
    passport_code: Optional[str] = None
    fact_key: str
    reason: str


class InsightsOverviewResponse(BaseModel):
    generated_at: datetime
    totals: InsightsTotals
    compliance_rate: Optional[float] = None
    pending_approvals: int
    avg_hours_to_decision: Optional[float] = None
    outdated_content: List[OutdatedContentItem] = Field(default_factory=list)
    findings_by_kind: Dict[str, int]
    findings_by_severity: Dict[str, int]


class TopRuleItem(BaseModel):
    rule_id: Optional[str] = None
    label: str
    kind: str
    count: int


class ViolationsByDayItem(BaseModel):
    date: str
    count: int


class ViolationsByCreatorItem(BaseModel):
    user_id: int
    name: str
    count: int


class InsightsViolationsResponse(BaseModel):
    days: int
    top_rules: List[TopRuleItem] = Field(default_factory=list)
    by_day: List[ViolationsByDayItem] = Field(default_factory=list)
    by_creator: List[ViolationsByCreatorItem] = Field(default_factory=list)


class DisputedRuleItem(BaseModel):
    rule_id: Optional[str] = None
    label: str
    raised: int
    dismissed: int
    dispute_rate: float


class InsightsAssetItem(BaseModel):
    asset_id: int
    title: str
    status: str
    passport_status: Optional[str] = None
    open_high: int
    open_total: int
    last_audited_at: Optional[datetime] = None
    compliance: str


# Expiry Status schemas
class UpcomingExpiryItem(BaseModel):
    fact_id: int
    key: str
    valid_until: Optional[datetime] = None
    days_left: int
    linked_assets: int


class ExpiryStatusResult(BaseModel):
    affected_assets_count: int


class ExpiryStatusResponse(BaseModel):
    last_run_at: Optional[datetime] = None
    last_run_source: Optional[str] = None
    last_result: Optional[ExpiryStatusResult] = None
    next_run_at: Optional[datetime] = None
    interval_minutes: int
    upcoming: List[UpcomingExpiryItem] = Field(default_factory=list)
