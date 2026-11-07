import json
import logging
from concurrent.futures import TimeoutError as FutureTimeoutError
import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.models import ContentAsset, GuidelineVersion, Fact
from backend.app.audit.gemini import (
    run_gemini_brand_audit,
    run_gemini_red_team,
    validate_gemini_findings,
    _AUDIT_CACHE,
    _REDTEAM_CACHE,
)


@pytest.fixture(autouse=True)
def clear_audit_caches():
    _AUDIT_CACHE.clear()
    _REDTEAM_CACHE.clear()
    yield
    _AUDIT_CACHE.clear()
    _REDTEAM_CACHE.clear()


def test_validation_drops_hallucinated_fact_id():
    text = "Experience 24 hours of playback with crystal clear acoustics."
    valid_guideline_id = 1
    valid_fact_ids = {10, 11}

    raw_findings = [
        {
            "kind": "tone",
            "severity": "medium",
            "quote": "crystal clear",
            "start_offset": text.find("crystal clear"),
            "end_offset": text.find("crystal clear") + len("crystal clear"),
            "explanation": "Tone sounds slightly cliché.",
            "suggestion": "balanced",
            "source_type": "guideline",
            "source_ref": 1,  # Valid guideline id
        },
        {
            "kind": "fact_mismatch",
            "severity": "high",
            "quote": "24 hours",
            "start_offset": text.find("24 hours"),
            "end_offset": text.find("24 hours") + len("24 hours"),
            "explanation": "Claim cites an invented fact.",
            "suggestion": "30 hours",
            "source_type": "fact",
            "source_ref": 9999,  # HALLUCINATED fact ID (not in valid_fact_ids)
        },
    ]

    validated = validate_gemini_findings(raw_findings, text, valid_guideline_id, valid_fact_ids)
    assert len(validated) == 1
    assert validated[0]["quote"] == "crystal clear"
    assert validated[0]["source_ref"] == 1
    # Assert hallucinated fact ID 9999 was DROPPED
    assert not any(f["source_ref"] == 9999 for f in validated)


def test_validation_drops_hallucinated_quote():
    text = "Experience 24 hours of reliable battery life."
    valid_fact_ids = {1}

    raw_findings = [
        {
            "kind": "unsupported_claim",
            "severity": "high",
            "quote": "totally waterproof underwater for days",  # Never in text
            "start_offset": 0,
            "end_offset": 30,
            "explanation": "Unverified waterproof statement.",
            "source_type": "none",
            "source_ref": None,
        }
    ]

    validated = validate_gemini_findings(raw_findings, text, 1, valid_fact_ids)
    # Quote not in text must be dropped
    assert len(validated) == 0


def test_mocked_gemini_brand_audit_success(db_session: Session):
    asset = db_session.query(ContentAsset).first()
    guideline_v = db_session.query(GuidelineVersion).first()
    facts = db_session.query(Fact).all()

    quote = asset.body.split()[0]
    idx = asset.body.find(quote)

    mock_response_json = json.dumps({
        "findings": [
            {
                "kind": "tone",
                "severity": "medium",
                "quote": quote,
                "start_offset": idx,
                "end_offset": idx + len(quote),
                "explanation": "Tone is overly casual for launch copy.",
                "suggestion": f"Discover {quote}",
                "source_type": "none",
                "source_ref": None,
            }
        ]
    })

    with patch.object(settings, "GEMINI_API_KEY", "mock-test-key"):
        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_client.models.generate_content.return_value = MagicMock(text=mock_response_json)

            findings, ai_available = run_gemini_brand_audit(asset.body, guideline_v, facts)
            assert ai_available is True
            assert len(findings) == 1
            assert findings[0]["quote"] == quote
            assert findings[0]["origin"] == "ai"
            assert findings[0]["kind"] == "tone"


def test_mocked_gemini_malformed_response_fallback(db_session: Session):
    asset = db_session.query(ContentAsset).first()
    guideline_v = db_session.query(GuidelineVersion).first()
    facts = db_session.query(Fact).all()

    with patch.object(settings, "GEMINI_API_KEY", "mock-test-key"):
        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_client.models.generate_content.return_value = MagicMock(text="INVALID NOT JSON {{{")

            findings, ai_available = run_gemini_brand_audit(asset.body, guideline_v, facts)
            # Malformed JSON should fail gracefully returning ai_available=False
            assert ai_available is False
            assert len(findings) == 0


def test_gemini_retry_on_429(db_session: Session):
    asset = db_session.query(ContentAsset).first()
    guideline_v = db_session.query(GuidelineVersion).first()
    facts = db_session.query(Fact).all()

    quote = asset.body.split()[0]
    idx = asset.body.find(quote)
    success_json = json.dumps({
        "findings": [
            {
                "kind": "tone",
                "severity": "low",
                "quote": quote,
                "start_offset": idx,
                "end_offset": idx + len(quote),
                "explanation": "Minor tone suggestion.",
                "suggestion": "Polished text",
                "source_type": "none",
                "source_ref": None,
            }
        ]
    })

    call_count = 0

    def mock_generate(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise Exception("429 RESOURCE_EXHAUSTED: Rate limit exceeded")
        return MagicMock(text=success_json)

    with patch.object(settings, "GEMINI_API_KEY", "mock-test-key"):
        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_client.models.generate_content.side_effect = mock_generate

            findings, ai_available = run_gemini_brand_audit(asset.body, guideline_v, facts)
            assert call_count == 2, "Expected 1 retry on 429"
            assert ai_available is True
            assert len(findings) == 1


def test_gemini_cache_hit(db_session: Session):
    asset = db_session.query(ContentAsset).first()
    guideline_v = db_session.query(GuidelineVersion).first()
    facts = db_session.query(Fact).all()

    success_json = json.dumps({"findings": []})
    generate_calls = 0

    def mock_generate(*args, **kwargs):
        nonlocal generate_calls
        generate_calls += 1
        return MagicMock(text=success_json)

    with patch.object(settings, "GEMINI_API_KEY", "mock-test-key"):
        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_client.models.generate_content.side_effect = mock_generate

            # First run
            f1, a1 = run_gemini_brand_audit(asset.body, guideline_v, facts)
            assert generate_calls == 1

            # Second run -> should hit cache without calling generate_content again
            f2, a2 = run_gemini_brand_audit(asset.body, guideline_v, facts)
            assert generate_calls == 1
            assert a2 is True


def test_mocked_gemini_red_team_personas():
    text = "Meet Kestrel One – simply the best headphones in the world! Guaranteed perfection."
    redteam_json = json.dumps({
        "risks": [
            {
                "persona": "critical_journalist",
                "category": "unsupported_promise",
                "severity": "high",
                "quote": "best headphones in the world",
                "why": "Unverified superlative claim without independent testing lab citation.",
            },
            {
                "persona": "competitor",
                "category": "misleading",
                "severity": "medium",
                "quote": "Guaranteed perfection",
                "why": "Creates an actionable warranty challenge on manufacturing tolerances.",
            },
            {
                "persona": "skeptical_customer",
                "category": "ambiguity",
                "severity": "low",
                "quote": "Kestrel One",
                "why": "Lacks clarity on package inclusions.",
            },
        ]
    })

    with patch.object(settings, "GEMINI_API_KEY", "mock-test-key"):
        with patch("google.genai.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value = mock_client
            mock_client.models.generate_content.return_value = MagicMock(text=redteam_json)

            risks, ai_available = run_gemini_red_team(text)
            assert ai_available is True
            assert len(risks) == 3

            personas = {r["persona"] for r in risks}
            assert "critical_journalist" in personas
            assert "competitor" in personas
            assert "skeptical_customer" in personas

            for r in risks:
                assert r["label"] == "potential risks"
                assert "false" not in r["why"].lower() or "unverified" in r["why"].lower()


def test_gemini_fallback_on_503(db_session: Session, caplog):
    asset = db_session.query(ContentAsset).first()
    guideline_v = db_session.query(GuidelineVersion).first()
    facts = db_session.query(Fact).all()

    models_called = []
    success_json = json.dumps({"findings": []})

    def mock_generate(*args, **kwargs):
        model = kwargs.get("model")
        models_called.append(model)
        if len(models_called) == 1:
            raise Exception("503 Service Unavailable: High load")
        return MagicMock(text=success_json)

    with patch.object(settings, "GEMINI_API_KEY", "mock-test-key"):
        with patch.object(settings, "GEMINI_MODEL", "gemini-2.5-flash"):
            with patch.object(settings, "GEMINI_FALLBACK_MODELS", "gemini-2.5-flash-lite"):
                with patch("google.genai.Client") as mock_client_cls:
                    mock_client = MagicMock()
                    mock_client_cls.return_value = mock_client
                    mock_client.models.generate_content.side_effect = mock_generate

                    with caplog.at_level(logging.INFO, logger="brandpilot.audit.gemini"):
                        findings, ai_available = run_gemini_brand_audit(asset.body, guideline_v, facts)
                        assert ai_available is True
                        assert models_called == ["gemini-2.5-flash", "gemini-2.5-flash-lite"]
                        assert any("Gemini model 'gemini-2.5-flash-lite' answered" in r.message for r in caplog.records)


def test_gemini_fallback_on_timeout(db_session: Session, caplog):
    asset = db_session.query(ContentAsset).first()
    guideline_v = db_session.query(GuidelineVersion).first()
    facts = db_session.query(Fact).all()

    models_called = []
    success_json = json.dumps({"findings": []})

    def mock_generate(*args, **kwargs):
        model = kwargs.get("model")
        models_called.append(model)
        if len(models_called) == 1:
            raise FutureTimeoutError("Call timed out after 15s")
        return MagicMock(text=success_json)

    with patch.object(settings, "GEMINI_API_KEY", "mock-test-key"):
        with patch.object(settings, "GEMINI_MODEL", "gemini-2.5-flash"):
            with patch.object(settings, "GEMINI_FALLBACK_MODELS", "gemini-2.5-flash-lite"):
                with patch("google.genai.Client") as mock_client_cls:
                    mock_client = MagicMock()
                    mock_client_cls.return_value = mock_client
                    mock_client.models.generate_content.side_effect = mock_generate

                    with caplog.at_level(logging.INFO, logger="brandpilot.audit.gemini"):
                        findings, ai_available = run_gemini_brand_audit(asset.body, guideline_v, facts)
                        assert ai_available is True
                        assert models_called == ["gemini-2.5-flash", "gemini-2.5-flash-lite"]
                        assert any("Gemini model 'gemini-2.5-flash-lite' answered" in r.message for r in caplog.records)


def test_gemini_no_retry_on_400_invalid_argument(db_session: Session):
    asset = db_session.query(ContentAsset).first()
    guideline_v = db_session.query(GuidelineVersion).first()
    facts = db_session.query(Fact).all()

    models_called = []

    def mock_generate(*args, **kwargs):
        models_called.append(kwargs.get("model"))
        raise Exception("400 INVALID_ARGUMENT: Bad model configuration")

    with patch.object(settings, "GEMINI_API_KEY", "mock-test-key"):
        with patch.object(settings, "GEMINI_MODEL", "gemini-2.5-flash"):
            with patch.object(settings, "GEMINI_FALLBACK_MODELS", "gemini-2.5-flash-lite"):
                with patch("google.genai.Client") as mock_client_cls:
                    mock_client = MagicMock()
                    mock_client_cls.return_value = mock_client
                    mock_client.models.generate_content.side_effect = mock_generate

                    findings, ai_available = run_gemini_brand_audit(asset.body, guideline_v, facts)
                    assert ai_available is False
                    assert len(findings) == 0
                    assert models_called == ["gemini-2.5-flash"], "Non-retryable 400 error should not invoke fallback"


def test_gemini_red_team_fallback_and_ai_unavailable():
    text = "Kestrel One delivers unbelievable sound."
    models_called = []

    def mock_generate(*args, **kwargs):
        models_called.append(kwargs.get("model"))
        raise Exception("503 Service Unavailable")

    with patch.object(settings, "GEMINI_API_KEY", "mock-test-key"):
        with patch.object(settings, "GEMINI_MODEL", "gemini-2.5-flash"):
            with patch.object(settings, "GEMINI_FALLBACK_MODELS", "gemini-2.5-flash-lite"):
                with patch("google.genai.Client") as mock_client_cls:
                    mock_client = MagicMock()
                    mock_client_cls.return_value = mock_client
                    mock_client.models.generate_content.side_effect = mock_generate

                    risks, ai_available = run_gemini_red_team(text)
                    assert ai_available is False
                    assert len(risks) == 0
                    assert models_called == ["gemini-2.5-flash", "gemini-2.5-flash-lite"]

