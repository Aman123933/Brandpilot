import pytest
from fastapi.testclient import TestClient


def test_health_endpoint(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert "timestamp" in data


def test_root_endpoint(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "BrandPilot API"


def test_guidelines_flow(client: TestClient, auth_headers):
    list_resp = client.get("/guidelines", headers=auth_headers["creator"])
    assert list_resp.status_code == 200
    guidelines = list_resp.json()
    assert len(guidelines) >= 1
    guideline_id = guidelines[0]["id"]

    detail_resp = client.get(f"/guidelines/{guideline_id}", headers=auth_headers["creator"])
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["title"] == "Kestrel Voice & Claims"
    assert len(detail["versions"]) == 1

    new_version_payload = {
        "body": "Updated Kestrel brand voice guidelines v2 with expanded claim rules.",
        "rules": {
            "banned_terms": [
                {"term": "cheap", "why": "Brand perception", "preferred": "accessible"},
                {"term": "unrivaled", "why": "Unprovable claim", "preferred": "finely tuned"},
            ],
            "required_phrases": ["Kestrel Audio", "Engineered for Clarity"],
            "tone_notes": ["authoritative", "minimalist"],
            "claim_rules": [
                {"pattern": "best", "requires_fact_key": None},
                {"pattern": "#1", "requires_fact_key": None},
            ],
        },
        "is_active": True,
    }

    add_v_resp = client.post(
        f"/guidelines/{guideline_id}/versions",
        json=new_version_payload,
        headers=auth_headers["manager"],
    )
    assert add_v_resp.status_code == 201
    v2_data = add_v_resp.json()
    assert v2_data["version"] == 2
    assert v2_data["is_active"] is True

    updated_detail = client.get(f"/guidelines/{guideline_id}", headers=auth_headers["manager"]).json()
    assert len(updated_detail["versions"]) == 2
    assert updated_detail["current_version"]["version"] == 2


def test_assets_flow(client: TestClient, auth_headers):
    list_resp = client.get("/assets", headers=auth_headers["creator"])
    assert list_resp.status_code == 200
    assets = list_resp.json()
    assert len(assets) == 2

    new_asset_payload = {
        "title": "Kestrel One Review Guide",
        "body": "A comprehensive reviewer guide showcasing 24-hour battery life and Bluetooth 5.3 connectivity.",
        "source_filename": "review_guide.txt",
    }
    create_resp = client.post("/assets", json=new_asset_payload, headers=auth_headers["creator"])
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["title"] == "Kestrel One Review Guide"
    assert created["current_revision"] == 1
    assert len(created["revisions"]) == 1
    assert created["revisions"][0]["revision"] == 1

    asset_id = created["id"]
    get_resp = client.get(f"/assets/{asset_id}", headers=auth_headers["reviewer"])
    assert get_resp.status_code == 200
    detail = get_resp.json()
    assert detail["id"] == asset_id
    assert detail["title"] == "Kestrel One Review Guide"
    assert len(detail["revisions"]) == 1
