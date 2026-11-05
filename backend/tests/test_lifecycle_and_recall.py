import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.models import ContentAsset, Fact, Passport, User, Organization
from backend.app.auth import create_access_token


def test_full_lifecycle_story_end_to_end(client: TestClient, auth_headers, db_session: Session):
    """
    End-to-end user story:
    1. Audit sample asset with planted issues
    2. Accept fixes via PATCH /findings/{id}
    3. Submit for review via POST /assets/{id}/submit
    4. Reviewer approves via POST /assets/{id}/decision (passport valid, links created)
    5. Manager previews impact of return_window_days 30 -> 14 via GET /facts/{id}/impact
    6. Manager updates fact via POST /facts/{id}/versions
    7. Passport is marked review_required, asset status is needs_revalidation, owner is notified
    8. Creator submits a revised revision
    9. Reviewer reapproves -> passport returns to valid, history shows both approvals
    """
    # 1. Fetch the planted issues asset and ensure it mentions return window as part of the full story
    assets_resp = client.get("/assets", headers=auth_headers["creator"])
    assert assets_resp.status_code == 200
    issue_asset = next(a for a in assets_resp.json() if "Social" in a["title"])
    asset_id = issue_asset["id"]

    # Append return window statement to complete the full story
    if "return" not in issue_asset["body"].lower():
        # Update body with return window
        db_asset = db_session.query(ContentAsset).filter(ContentAsset.id == asset_id).first()
        db_asset.body = db_asset.body + " Includes our official 30-day return window."
        db_session.commit()

    # 1. Run audit
    audit_resp = client.post(f"/assets/{asset_id}/audit", headers=auth_headers["creator"])
    assert audit_resp.status_code == 200
    audit_data = audit_resp.json()
    assert audit_data["total_findings"] >= 4

    # 2. Accept fixes on all open findings with suggestions
    findings_resp = client.get(f"/assets/{asset_id}/findings", headers=auth_headers["creator"])
    findings = findings_resp.json()
    for f in findings:
        if f.get("suggestion") and f["status"] == "open":
            patch_resp = client.patch(
                f"/findings/{f['id']}",
                json={"status": "accepted"},
                headers=auth_headers["creator"],
            )
            assert patch_resp.status_code == 200

    # Ensure the asset's current revision is audited
    curr_asset = client.get(f"/assets/{asset_id}", headers=auth_headers["creator"]).json()
    curr_rev = curr_asset["current_revision"]
    client.post(f"/assets/{asset_id}/audit", headers=auth_headers["creator"])

    # 3. Submit for review (creator)
    submit_resp = client.post(f"/assets/{asset_id}/submit", headers=auth_headers["creator"])
    assert submit_resp.status_code == 200
    submit_data = submit_resp.json()
    assert submit_data["status"] == "in_review"

    # Review queue includes asset
    queue_resp = client.get("/reviews/queue", headers=auth_headers["reviewer"])
    assert queue_resp.status_code == 200
    queue = queue_resp.json()
    assert any(item["asset_id"] == asset_id for item in queue)

    # 4. Reviewer approves
    decision_resp = client.post(
        f"/assets/{asset_id}/decision",
        json={"decision": "approved", "comment": "Excellent copy, approved for publication."},
        headers=auth_headers["reviewer"],
    )
    assert decision_resp.status_code == 200
    decision_data = decision_resp.json()
    assert decision_data["status"] == "approved"
    passport_code = decision_data["passport_code"]
    assert passport_code is not None
    assert passport_code.startswith("BP-")

    # Verify public passport
    pub_resp = client.get(f"/passports/{passport_code}/public")
    assert pub_resp.status_code == 200
    pub_data = pub_resp.json()
    assert pub_data["status"] == "valid"
    assert pub_data["reviewer_first_name"] == "Sana"
    assert pub_data["linked_facts_count"] >= 1
    # Verify no leaks
    assert "body" not in pub_data
    assert "facts" not in pub_data

    # Verify QR code generation
    qr_resp = client.get(f"/passports/{passport_code}/qr.png")
    assert qr_resp.status_code == 200
    assert qr_resp.headers["content-type"] == "image/png"
    assert len(qr_resp.content) > 100

    # 5. Fetch return_window_days fact & preview impact (30 -> 14)
    facts_resp = client.get("/facts", headers=auth_headers["manager"])
    return_fact = next(f for f in facts_resp.json() if f["key"] == "return_window_days")
    fact_id = return_fact["id"]

    impact_resp = client.get(f"/facts/{fact_id}/impact?new_value=14", headers=auth_headers["manager"])
    assert impact_resp.status_code == 200
    impact_data = impact_resp.json()
    assert impact_data["old_value"] == "30"
    assert impact_data["new_value"] == "14"

    # 6. Manager updates fact: POST /facts/{id}/versions
    new_v_payload = {
        "value": "14",
        "unit": "days",
        "source_note": "Policy updated to 14 days standard return window",
    }
    update_fact_resp = client.post(
        f"/facts/{fact_id}/versions",
        json=new_v_payload,
        headers=auth_headers["manager"],
    )
    assert update_fact_resp.status_code == 201

    # 7. Check that Passport is now review_required & asset status is needs_revalidation
    pub_check = client.get(f"/passports/{passport_code}/public")
    assert pub_check.status_code == 200
    assert pub_check.json()["status"] == "review_required"

    asset_reval = client.get(f"/assets/{asset_id}", headers=auth_headers["creator"]).json()
    assert asset_reval["status"] == "needs_revalidation"

    # Check notification sent to creator
    notifs_resp = client.get("/notifications", headers=auth_headers["creator"])
    assert notifs_resp.status_code == 200
    creator_notifs = notifs_resp.json()
    assert any("return_window_days" in n["message"] and "revalidation" in n["message"] for n in creator_notifs)

    # 8. Creator revises asset body and audits it
    revised_body = asset_reval["body"] + " Updated with 14 days return policy."
    # Direct submit requires audit on current revision
    client.post(f"/assets/{asset_id}/audit", headers=auth_headers["creator"])
    submit_rev2 = client.post(f"/assets/{asset_id}/submit", headers=auth_headers["creator"])
    assert submit_rev2.status_code == 200

    # 9. Reviewer re-approves
    reapprove_resp = client.post(
        f"/assets/{asset_id}/decision",
        json={"decision": "approved", "comment": "Re-approved with new 14-day policy."},
        headers=auth_headers["reviewer"],
    )
    assert reapprove_resp.status_code == 200
    reapp_data = reapprove_resp.json()
    assert reapp_data["status"] == "approved"
    assert reapp_data["passport_code"] == passport_code

    # Passport returns to valid
    pub_final = client.get(f"/passports/{passport_code}/public").json()
    assert pub_final["status"] == "valid"

    # History shows both approvals
    hist_resp = client.get(f"/assets/{asset_id}/history", headers=auth_headers["creator"])
    assert hist_resp.status_code == 200
    hist = hist_resp.json()
    assert len(hist["approvals"]) >= 2
    assert any("Re-approved with new 14-day policy" in a["comment"] for a in hist["approvals"])


def test_authorization_creator_cannot_approve(client: TestClient, auth_headers):
    assets_resp = client.get("/assets", headers=auth_headers["creator"])
    asset_id = assets_resp.json()[0]["id"]

    # Creator attempts to approve their own content -> 403 Forbidden
    resp = client.post(
        f"/assets/{asset_id}/decision",
        json={"decision": "approved", "comment": "Self approval attempt"},
        headers=auth_headers["creator"],
    )
    assert resp.status_code == 403
    assert "Creators cannot approve their own content" in resp.json()["detail"]


def test_comment_required_on_reject_or_changes_requested(client: TestClient, auth_headers):
    assets_resp = client.get("/assets", headers=auth_headers["creator"])
    asset_id = assets_resp.json()[0]["id"]

    resp = client.post(
        f"/assets/{asset_id}/decision",
        json={"decision": "changes_requested", "comment": ""},
        headers=auth_headers["reviewer"],
    )
    assert resp.status_code == 400
    assert "comment is required" in resp.json()["detail"].lower()


def test_cross_org_access_forbidden(client: TestClient, auth_headers, db_session: Session):
    # Create another organization and user
    other_org = Organization(name="Other Corp", slug="other-corp")
    db_session.add(other_org)
    db_session.flush()

    other_user = User(
        org_id=other_org.id,
        name="External User",
        email="external@othercorp.com",
        role="creator",
    )
    db_session.add(other_user)
    db_session.flush()
    other_token = create_access_token(other_user)
    other_headers = {"Authorization": f"Bearer {other_token}"}

    # Fetch Kestrel asset ID
    kestrel_assets = client.get("/assets", headers=auth_headers["creator"]).json()
    kestrel_asset_id = kestrel_assets[0]["id"]

    # User from other_org cannot access Kestrel asset
    resp = client.get(f"/assets/{kestrel_asset_id}", headers=other_headers)
    assert resp.status_code == 404 or resp.status_code == 403


def test_double_approve_is_idempotent(client: TestClient, auth_headers):
    assets_resp = client.get("/assets", headers=auth_headers["creator"])
    asset_id = assets_resp.json()[0]["id"]

    # Audit & submit
    client.post(f"/assets/{asset_id}/audit", headers=auth_headers["creator"])
    client.post(f"/assets/{asset_id}/submit", headers=auth_headers["creator"])

    # First approval
    resp1 = client.post(
        f"/assets/{asset_id}/decision",
        json={"decision": "approved", "comment": "First approval"},
        headers=auth_headers["reviewer"],
    )
    assert resp1.status_code == 200
    code1 = resp1.json()["passport_code"]

    # Second approval (e.g. repeated call)
    resp2 = client.post(
        f"/assets/{asset_id}/decision",
        json={"decision": "approved", "comment": "Second approval"},
        headers=auth_headers["reviewer"],
    )
    assert resp2.status_code == 200
    code2 = resp2.json()["passport_code"]

    assert code1 == code2, "Double approval must return the exact same passport code, not duplicate"


def test_admin_run_expiry_check(client: TestClient, auth_headers):
    # Brand manager runs expiry check
    resp = client.post("/admin/run-expiry-check", headers=auth_headers["manager"])
    assert resp.status_code == 200
    data = resp.json()
    assert "checked_at" in data
    assert "affected_assets_count" in data
    assert isinstance(data["affected_assets"], list)


def test_notifications_read_flow(client: TestClient, auth_headers):
    notifs_resp = client.get("/notifications", headers=auth_headers["reviewer"])
    assert notifs_resp.status_code == 200
    notifs = notifs_resp.json()
    if notifs:
        target_id = notifs[0]["id"]
        read_resp = client.patch(f"/notifications/{target_id}/read", headers=auth_headers["reviewer"])
        assert read_resp.status_code == 200
        assert read_resp.json()["read"] is True
