import pytest
from backend.app.config import settings


def test_contract_auth_endpoints(client, auth_headers):
    # 1. GET /auth/demo-credentials
    resp = client.get("/auth/demo-credentials")
    assert resp.status_code == 200
    creds = resp.json()
    assert isinstance(creds, list)
    assert len(creds) >= 3
    for c in creds:
        assert set(c.keys()) == {"name", "email", "password", "role", "description"}

    # 2. POST /auth/login
    resp = client.post(
        "/auth/login",
        json={"email": "dev@kestrelaudio.com", "password": "Demo@2026"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert set(data.keys()) == {"access_token", "token_type", "user"}
    assert set(data["user"].keys()) == {"id", "org_id", "name", "email", "role", "created_at"}

    # 3. GET /auth/me
    token = data["access_token"]
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    me = resp.json()
    assert set(me.keys()) == {"id", "org_id", "name", "email", "role", "created_at"}


def test_contract_health_endpoint(client):
    # GET /health
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    expected_keys = {"status", "version", "database", "timestamp", "database_engine", "ai"}
    assert expected_keys.issubset(set(data.keys()))
    assert data["database_engine"] in ("sqlite", "postgresql")
    assert set(data["ai"].keys()) == {"configured", "model"}


def test_contract_brand_git_endpoints(client, auth_headers):
    manager_hdr = auth_headers["manager"]

    # 1. GET /guidelines/{id}/versions
    resp = client.get("/guidelines/1/versions", headers=manager_hdr)
    assert resp.status_code == 200
    versions = resp.json()
    assert isinstance(versions, list)
    assert len(versions) >= 1
    v1 = versions[0]
    expected_v_keys = {
        "id", "version", "status", "created_at", "created_by",
        "change_note", "rules_summary", "latest_replay",
    }
    assert expected_v_keys.issubset(set(v1.keys()))
    assert set(v1["rules_summary"].keys()) == {"banned_terms", "required_phrases", "claim_rules"}

    # 2. POST /guidelines/{id}/versions (create draft version 2)
    new_v_payload = {
        "body": "Updated body text for Kestrel Voice",
        "change_note": "Ban 'unrivaled'",
        "activate": False,
        "rules": {
            "banned_terms": [
                {
                    "id": "BT-001",
                    "term": "cheap",
                    "why": "Undermines premium perception",
                    "preferred": "affordable",
                },
                {
                    "id": "BT-004",
                    "term": "unrivaled",
                    "why": "Unsubstantiated absolute claim",
                    "preferred": "high-performing",
                },
            ],
            "required_phrases": [
                {
                    "id": "RP-001",
                    "phrase": "Kestrel One",
                    "why": "Product name",
                }
            ],
            "tone_notes": ["confident", "plain", "no hype"],
            "claim_rules": [],
        },
    }
    resp = client.post("/guidelines/1/versions", json=new_v_payload, headers=manager_hdr)
    assert resp.status_code == 201
    created_v = resp.json()
    assert expected_v_keys.issubset(set(created_v.keys()))
    assert "rules" in created_v
    assert created_v["status"] == "draft"
    v2_num = created_v["version"]

    # 3. GET /guidelines/{id}/diff?from=1&to=2
    resp = client.get(f"/guidelines/1/diff?from=1&to={v2_num}", headers=manager_hdr)
    assert resp.status_code == 200
    diff = resp.json()
    assert set(diff.keys()) == {"guideline_id", "from_version", "to_version", "summary", "changes"}
    assert set(diff["summary"].keys()) == {"added", "removed", "changed"}
    assert isinstance(diff["changes"], list)
    if diff["changes"]:
        for ch in diff["changes"]:
            assert set(ch.keys()) == {"kind", "section", "rule_id", "before", "after"}

    # 4. POST /guidelines/{id}/versions/{v2_num}/replay
    resp = client.post(f"/guidelines/1/versions/{v2_num}/replay", json={"scope": "all"}, headers=manager_hdr)
    assert resp.status_code == 200
    replay = resp.json()
    expected_replay_keys = {
        "guideline_id", "active_version", "proposed_version", "scope",
        "ran_at", "assets_checked", "summary", "newly_flagged", "newly_cleared",
    }
    assert expected_replay_keys == set(replay.keys())
    assert set(replay["summary"].keys()) == {
        "assets_newly_noncompliant", "assets_newly_compliant",
        "violations_added", "violations_cleared", "unchanged_violations",
    }

    # 5. GET /guidelines/{id}/versions/{v2_num}/replay
    resp = client.get(f"/guidelines/1/versions/{v2_num}/replay", headers=manager_hdr)
    assert resp.status_code == 200, f"GET replay returned {resp.status_code}: {resp.json()}"
    get_replay = resp.json()
    assert expected_replay_keys == set(get_replay.keys())

    # 6. POST /guidelines/{id}/versions/{v2_num}/activate
    resp = client.post(f"/guidelines/1/versions/{v2_num}/activate", json={"note": "Activating v2"}, headers=manager_hdr)
    assert resp.status_code == 200, f"Activate returned {resp.status_code}: {resp.json()}"
    act_data = resp.json()
    assert set(act_data.keys()) == {
        "guideline_id", "version", "status", "previous_version", "assets_to_recheck",
    }
    assert act_data["status"] == "active"

    # 7. Create draft v3 and test reject
    new_v3_payload = {
        "body": "Draft v3 to reject",
        "change_note": "Experimental rules",
        "activate": False,
        "rules": {"banned_terms": [], "required_phrases": [], "tone_notes": [], "claim_rules": []},
    }
    resp = client.post("/guidelines/1/versions", json=new_v3_payload, headers=manager_hdr)
    assert resp.status_code == 201
    v3_num = resp.json()["version"]

    resp = client.post(
        f"/guidelines/1/versions/{v3_num}/reject",
        json={"note": "Rejected because experimental rules fail QA"},
        headers=manager_hdr,
    )
    assert resp.status_code == 200
    rej_data = resp.json()
    assert set(rej_data.keys()) == {"version", "status"}
    assert rej_data["status"] == "rejected"


def test_contract_insights_endpoints(client, auth_headers):
    manager_hdr = auth_headers["manager"]

    # 1. GET /insights/overview
    resp = client.get("/insights/overview", headers=manager_hdr)
    assert resp.status_code == 200
    data = resp.json()
    expected_keys = {
        "generated_at", "totals", "compliance_rate", "pending_approvals",
        "avg_hours_to_decision", "outdated_content", "findings_by_kind", "findings_by_severity",
    }
    assert expected_keys == set(data.keys())
    assert set(data["totals"].keys()) == {
        "assets", "approved_valid", "review_required", "in_review", "drafts", "withdrawn",
    }

    # 2. GET /insights/violations?days=30
    resp = client.get("/insights/violations?days=30", headers=manager_hdr)
    assert resp.status_code == 200
    viol = resp.json()
    assert set(viol.keys()) == {"days", "top_rules", "by_day", "by_creator"}

    # 3. GET /insights/disputed-rules
    resp = client.get("/insights/disputed-rules", headers=manager_hdr)
    assert resp.status_code == 200
    disputed = resp.json()
    assert isinstance(disputed, list)

    # 4. GET /insights/assets
    resp = client.get("/insights/assets", headers=manager_hdr)
    assert resp.status_code == 200
    assets_insights = resp.json()
    assert isinstance(assets_insights, list)
    if assets_insights:
        item = assets_insights[0]
        assert set(item.keys()) == {
            "asset_id", "title", "status", "passport_status",
            "open_high", "open_total", "last_audited_at", "compliance",
        }


def test_contract_admin_and_cron_endpoints(client, auth_headers):
    manager_hdr = auth_headers["manager"]

    # 1. GET /admin/expiry-status
    resp = client.get("/admin/expiry-status", headers=manager_hdr)
    assert resp.status_code == 200
    exp_status = resp.json()
    expected_keys = {
        "last_run_at", "last_run_source", "last_result",
        "next_run_at", "interval_minutes", "upcoming",
    }
    assert expected_keys == set(exp_status.keys())

    # 2. POST /cron/expiry with CRON_SECRET configured
    settings.CRON_SECRET = "test-cron-secret-123"
    resp = client.post("/cron/expiry", headers={"X-Cron-Secret": "test-cron-secret-123"})
    assert resp.status_code == 200
    cron_data = resp.json()
    assert set(cron_data.keys()) == {"checked_at", "affected_assets_count", "affected_assets"}

    # 3. POST /admin/reset-demo
    resp = client.post("/admin/reset-demo", headers=manager_hdr)
    assert resp.status_code == 200
    assert resp.json() == {"detail": "Demo data restored"}


def test_contract_passport_withdrawal_and_audit(client, auth_headers):
    manager_hdr = auth_headers["manager"]
    reviewer_hdr = auth_headers["reviewer"]

    # First audit and approve an asset to generate passport
    audit_resp = client.post("/assets/1/audit", headers=manager_hdr)
    assert audit_resp.status_code == 200
    audit_data = audit_resp.json()
    assert "ai_message" in audit_data

    # Red team
    rt_resp = client.post("/assets/1/redteam", headers=manager_hdr)
    assert rt_resp.status_code == 200
    assert "ai_message" in rt_resp.json()

    # Submit
    client.post("/assets/1/submit", headers=manager_hdr)

    # Approve
    dec_resp = client.post("/assets/1/decision", json={"decision": "approved", "comment": "Approved!"}, headers=reviewer_hdr)
    assert dec_resp.status_code == 200
    code = dec_resp.json()["passport_code"]
    assert code is not None

    # Full authenticated passport
    p_resp = client.get(f"/passports/{code}", headers=manager_hdr)
    assert p_resp.status_code == 200
    p_data = p_resp.json()
    assert "withdrawn_reason" in p_data
    assert "withdrawn_at" in p_data
    assert "withdrawn_by" in p_data

    # Withdraw passport with reason
    w_resp = client.post(f"/passports/{code}/withdraw", json={"reason": "Content no longer valid"}, headers=manager_hdr)
    assert w_resp.status_code == 200
    w_data = w_resp.json()
    assert set(w_data.keys()) == {
        "code", "asset_title", "status", "approved_at",
        "reviewer_first_name", "guideline_version_label", "linked_facts_count", "ai_disclosure",
    }
    assert w_data["status"] == "withdrawn"


def test_permission_matrix(client, auth_headers):
    manager_hdr = auth_headers["manager"]
    creator_hdr = auth_headers["creator"]
    reviewer_hdr = auth_headers["reviewer"]

    # 1. Guideline version creation: manager only
    payload = {
        "body": "Test",
        "change_note": "Test note",
        "rules": {"banned_terms": [], "required_phrases": [], "tone_notes": [], "claim_rules": []},
    }
    assert client.post("/guidelines/1/versions", json=payload, headers=creator_hdr).status_code == 403
    assert client.post("/guidelines/1/versions", json=payload, headers=reviewer_hdr).status_code == 403
    assert client.post("/guidelines/1/versions", json=payload).status_code == 401

    # 2. Decision recording: reviewer only
    dec_payload = {"decision": "rejected", "comment": "Not brand compliant"}
    assert client.post("/assets/1/decision", json=dec_payload, headers=creator_hdr).status_code == 403
    assert client.post("/assets/1/decision", json=dec_payload, headers=manager_hdr).status_code == 403
    assert client.post("/assets/1/decision", json=dec_payload).status_code == 401

    # 3. Admin reset: manager only
    assert client.post("/admin/reset-demo", headers=creator_hdr).status_code == 403
    assert client.post("/admin/reset-demo", headers=reviewer_hdr).status_code == 403
    assert client.post("/admin/reset-demo").status_code == 401


def test_org_isolation(client, db_session, auth_headers):
    from backend.app.models import Organization, User, ContentAsset, AssetRevision
    from backend.app.auth import create_access_token

    # Create Org 2
    org2 = Organization(name="Competitor Inc", slug="competitor")
    db_session.add(org2)
    db_session.commit()

    user2 = User(
        org_id=org2.id,
        name="Alice Competitor",
        email="alice@competitor.com",
        role="creator",
        password_hash="fake",
        salt="fake",
    )
    db_session.add(user2)
    db_session.commit()

    asset2 = ContentAsset(
        org_id=org2.id,
        title="Secret Asset",
        body="Secret text",
        creator_id=user2.id,
        status="draft",
        current_revision=1,
    )
    db_session.add(asset2)
    db_session.commit()

    # Org 1 user accessing Org 2 asset must return 404 (NOT 403)
    resp = client.get(f"/assets/{asset2.id}", headers=auth_headers["manager"])
    assert resp.status_code == 404, "Cross-org asset access must return 404 Not Found"

    # Org 2 user accessing Org 1 asset must return 404
    token2 = create_access_token(user2)
    resp = client.get("/assets/1", headers={"Authorization": f"Bearer {token2}"})
    assert resp.status_code == 404, "Cross-org asset access must return 404 Not Found"


def test_idempotency_and_conflicts(client, auth_headers):
    manager_hdr = auth_headers["manager"]
    reviewer_hdr = auth_headers["reviewer"]

    # 1. Double submit -> 409
    client.post("/assets/1/audit", headers=manager_hdr)
    resp1 = client.post("/assets/1/submit", headers=manager_hdr)
    assert resp1.status_code == 200
    resp2 = client.post("/assets/1/submit", headers=manager_hdr)
    assert resp2.status_code == 409, "Submitting an asset that is already in_review must return 409"

    # 2. Approve -> Generate passport
    dec_resp = client.post("/assets/1/decision", json={"decision": "approved", "comment": "Approved"}, headers=reviewer_hdr)
    assert dec_resp.status_code == 200
    code = dec_resp.json()["passport_code"]

    # 3. Double withdraw -> 409
    w1 = client.post(f"/passports/{code}/withdraw", json={"reason": "First withdrawal"}, headers=manager_hdr)
    assert w1.status_code == 200
    w2 = client.post(f"/passports/{code}/withdraw", json={"reason": "Second withdrawal"}, headers=manager_hdr)
    assert w2.status_code == 409, "Withdrawing an already withdrawn passport must return 409"

    # 4. Brand Git: Activate already active -> 409
    act_resp = client.post("/guidelines/1/versions/1/activate", json={"note": "Activating active"}, headers=manager_hdr)
    assert act_resp.status_code == 409, "Activating an already active version must return 409"


def test_auth_throttling(client):
    email = "dev@kestrelaudio.com"
    # 5 failed attempts
    for _ in range(5):
        resp = client.post("/auth/login", json={"email": email, "password": "WrongPassword!"})
        assert resp.status_code == 401

    # 6th attempt within 10 minutes -> 429 Too Many Requests
    resp6 = client.post("/auth/login", json={"email": email, "password": "Demo@2026"})
    assert resp6.status_code == 429
    assert "Too many attempts" in resp6.json()["detail"]


def test_brand_git_diff_details_and_replay(client, auth_headers):
    manager_hdr = auth_headers["manager"]

    # Create v2 with added rule BT-999
    new_v = {
        "body": "Updated body",
        "change_note": "Added BT-999",
        "activate": False,
        "rules": {
            "banned_terms": [
                {"id": "BT-001", "term": "cheap", "why": "Undermines premium perception", "preferred": "affordable"},
                {"id": "BT-999", "term": "headphones", "why": "Use earbuds instead", "preferred": "earbuds"},
            ],
            "required_phrases": [],
            "tone_notes": [],
            "claim_rules": [],
        },
    }
    res = client.post("/guidelines/1/versions", json=new_v, headers=manager_hdr)
    v2_num = res.json()["version"]

    # Check diff
    diff_res = client.get(f"/guidelines/1/diff?from=1&to={v2_num}", headers=manager_hdr)
    assert diff_res.status_code == 200
    diff = diff_res.json()
    assert diff["summary"]["added"] >= 1
    added_rules = [c for c in diff["changes"] if c["kind"] == "added" and c["rule_id"] == "BT-999"]
    assert len(added_rules) == 1

    # Replay
    replay_res = client.post(f"/guidelines/1/versions/{v2_num}/replay", json={"scope": "all"}, headers=manager_hdr)
    assert replay_res.status_code == 200
    rep = replay_res.json()
    assert rep["assets_checked"] >= 1
    # Check that newly_flagged items include rule_id
    if rep["newly_flagged"]:
        for item in rep["newly_flagged"]:
            assert "rule_id" in item


def test_expiry_deduplication(client, db_session, auth_headers):
    from datetime import datetime, timedelta, timezone
    from backend.app.models import FactVersion, Notification
    from backend.app.services.recall import check_expired_facts

    # Set valid_until to yesterday for FactVersion 1
    fv = db_session.query(FactVersion).filter(FactVersion.id == 1).first()
    fv.valid_until = datetime.now(timezone.utc) - timedelta(days=1)
    db_session.commit()

    # Count initial notifications
    initial_count = db_session.query(Notification).filter(Notification.fact_version_id == 1).count()

    # First run of check_expired_facts
    check_expired_facts(db_session, source="manual")
    count_after_first = db_session.query(Notification).filter(Notification.fact_version_id == 1).count()

    # Second run of check_expired_facts
    check_expired_facts(db_session, source="manual")
    count_after_second = db_session.query(Notification).filter(Notification.fact_version_id == 1).count()

    # Must not duplicate notification
    assert count_after_second == count_after_first, "Expiry check must be idempotent and not create duplicate notifications"


def test_insights_seeded_data_metrics(client, auth_headers):
    manager_hdr = auth_headers["manager"]
    res = client.get("/insights/overview", headers=manager_hdr)
    assert res.status_code == 200
    data = res.json()
    assert data["totals"]["assets"] >= 2
    assert "compliance_rate" in data
    assert data["compliance_rate"] is None or 0.0 <= data["compliance_rate"] <= 100.0


def test_upload_edge_cases(client, auth_headers):
    creator_hdr = auth_headers["creator"]

    # 1. Empty file
    files = {"file": ("empty.txt", b"", "text/plain")}
    resp = client.post("/assets/upload", files=files, data={"title": "Empty Doc"}, headers=creator_hdr)
    assert resp.status_code == 400
    assert "empty" in resp.json()["detail"].lower()

    # 2. Unsupported extension
    files = {"file": ("script.exe", b"binarycontent", "application/octet-stream")}
    resp = client.post("/assets/upload", files=files, data={"title": "Malware"}, headers=creator_hdr)
    assert resp.status_code == 400
    assert "unsupported" in resp.json()["detail"].lower()

    # 3. Exceeds 5MB
    large_bytes = b"x" * (5 * 1024 * 1024 + 100)
    files = {"file": ("large.txt", large_bytes, "text/plain")}
    resp = client.post("/assets/upload", files=files, data={"title": "Too Large"}, headers=creator_hdr)
    assert resp.status_code == 400
    assert "5 mb" in resp.json()["detail"].lower()

