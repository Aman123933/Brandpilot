import pytest
from fastapi.testclient import TestClient


def test_audit_endpoint_flow(client: TestClient, auth_headers):
    # 1. Get assets list to find planted-issues asset
    assets_resp = client.get("/assets", headers=auth_headers["creator"])
    assert assets_resp.status_code == 200
    assets = assets_resp.json()
    issue_asset = next(a for a in assets if "Social" in a["title"])
    asset_id = issue_asset["id"]

    # 2. Run POST /assets/{id}/audit
    audit_resp = client.post(f"/assets/{asset_id}/audit", headers=auth_headers["reviewer"])
    assert audit_resp.status_code == 200
    data = audit_resp.json()
    assert data["asset_id"] == asset_id
    assert data["revision"] == 1
    assert "findings" in data
    assert "high" in data["findings"]
    assert "medium" in data["findings"]
    assert "low" in data["findings"]
    assert data["total_findings"] >= 4

    # Check that high severity includes fact mismatches and banned terms
    high_findings = data["findings"]["high"]
    quotes = [f["quote"] for f in high_findings]
    assert any("cheap" in q for q in quotes)
    assert any("battery" in q or "30" in q for q in quotes)


def test_get_findings_endpoint(client: TestClient, auth_headers):
    assets_resp = client.get("/assets", headers=auth_headers["creator"])
    assets = assets_resp.json()
    asset_id = assets[0]["id"]

    # Trigger audit first
    client.post(f"/assets/{asset_id}/audit", headers=auth_headers["manager"])

    # GET /assets/{id}/findings
    findings_resp = client.get(f"/assets/{asset_id}/findings", headers=auth_headers["creator"])
    assert findings_resp.status_code == 200
    findings = findings_resp.json()
    assert isinstance(findings, list)

    # With revision query param
    rev_resp = client.get(f"/assets/{asset_id}/findings?revision=1", headers=auth_headers["creator"])
    assert rev_resp.status_code == 200
    assert isinstance(rev_resp.json(), list)


def test_patch_finding_accept_flow(client: TestClient, auth_headers):
    assets_resp = client.get("/assets", headers=auth_headers["creator"])
    assets = assets_resp.json()
    issue_asset = next(a for a in assets if "Social" in a["title"])
    asset_id = issue_asset["id"]

    # Audit the asset
    audit_resp = client.post(f"/assets/{asset_id}/audit", headers=auth_headers["manager"])
    assert audit_resp.status_code == 200

    findings_resp = client.get(f"/assets/{asset_id}/findings", headers=auth_headers["creator"])
    findings = findings_resp.json()
    assert len(findings) > 0

    # Pick a finding with a suggestion (e.g. 'cheap' -> 'affordable')
    target_finding = next((f for f in findings if f["quote"].lower() == "cheap" and f.get("suggestion")), findings[0])
    finding_id = target_finding["id"]

    # PATCH /findings/{id} with status = "accepted"
    patch_resp = client.patch(
        f"/findings/{finding_id}",
        json={"status": "accepted"},
        headers=auth_headers["creator"],
    )
    assert patch_resp.status_code == 200
    patch_data = patch_resp.json()
    assert patch_data["finding"]["id"] == finding_id
    assert patch_data["finding"]["status"] == "accepted"
    assert patch_data["new_revision"] == 2
    assert patch_data["new_body"] is not None

    # Check asset now has revision 2 and updated current_revision
    asset_detail = client.get(f"/assets/{asset_id}", headers=auth_headers["creator"]).json()
    assert asset_detail["current_revision"] == 2
    assert len(asset_detail["revisions"]) == 2
    if target_finding.get("suggestion"):
        assert target_finding["suggestion"] in asset_detail["body"]

    # Verify deterministic checks were re-run for revision 2
    rev2_findings = client.get(f"/assets/{asset_id}/findings?revision=2", headers=auth_headers["creator"]).json()
    assert isinstance(rev2_findings, list)


def test_patch_finding_dismiss_flow(client: TestClient, auth_headers):
    assets_resp = client.get("/assets", headers=auth_headers["creator"])
    assets = assets_resp.json()
    issue_asset = next(a for a in assets if "Social" in a["title"])
    asset_id = issue_asset["id"]

    # Audit the asset
    client.post(f"/assets/{asset_id}/audit", headers=auth_headers["manager"])
    findings = client.get(f"/assets/{asset_id}/findings", headers=auth_headers["creator"]).json()
    assert len(findings) > 0
    finding_id = findings[0]["id"]

    # Dismiss
    patch_resp = client.patch(
        f"/findings/{finding_id}",
        json={"status": "dismissed"},
        headers=auth_headers["creator"],
    )
    assert patch_resp.status_code == 200
    patch_data = patch_resp.json()
    assert patch_data["finding"]["id"] == finding_id
    assert patch_data["finding"]["status"] == "dismissed"
    assert patch_data["new_revision"] is None


def test_redteam_endpoint(client: TestClient, auth_headers):
    assets_resp = client.get("/assets", headers=auth_headers["creator"])
    assets = assets_resp.json()
    asset_id = assets[0]["id"]

    # POST /assets/{id}/redteam
    resp = client.post(f"/assets/{asset_id}/redteam", headers=auth_headers["reviewer"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["asset_id"] == asset_id
    assert "risks" in data
    assert isinstance(data["risks"], list)
