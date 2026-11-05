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
