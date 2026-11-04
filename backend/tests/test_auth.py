import pytest
from fastapi.testclient import TestClient


def test_list_demo_users(client: TestClient):
    response = client.get("/auth/demo-users")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 3

    roles = {u["role"]: u["name"] for u in data}
    assert "brand_manager" in roles
    assert "creator" in roles
    assert "reviewer" in roles
    assert roles["brand_manager"] == "Maya Lin"
    assert roles["creator"] == "Dev Patel"
    assert roles["reviewer"] == "Sana Miller"


def test_demo_login_success(client: TestClient):
    users_resp = client.get("/auth/demo-users")
    user_id = users_resp.json()[0]["id"]

    login_resp = client.post("/auth/demo-login", json={"user_id": user_id})
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["id"] == user_id


def test_demo_login_nonexistent_user(client: TestClient):
    resp = client.post("/auth/demo-login", json={"user_id": 999999})
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_unauthenticated_request_fails(client: TestClient):
    resp = client.get("/facts")
    assert resp.status_code == 401
    assert "required" in resp.json()["detail"].lower()


def test_fact_creation_role_enforcement(client: TestClient, auth_headers):
    payload = {
        "key": "waterproof_rating",
        "value": "IPX7",
        "unit": "IPX",
        "source_note": "Lab certification memo",
    }

    resp_reviewer = client.post("/facts", json=payload, headers=auth_headers["reviewer"])
    assert resp_reviewer.status_code == 403
    assert "not authorized" in resp_reviewer.json()["detail"].lower()

    resp_creator = client.post("/facts", json=payload, headers=auth_headers["creator"])
    assert resp_creator.status_code == 403
    assert "not authorized" in resp_creator.json()["detail"].lower()

    resp_manager = client.post("/facts", json=payload, headers=auth_headers["manager"])
    assert resp_manager.status_code == 201
    assert resp_manager.json()["key"] == "waterproof_rating"


def test_guideline_creation_role_enforcement(client: TestClient, auth_headers):
    payload = {
        "title": "Packaging & Unboxing Voice",
        "body": "Eco-friendly, minimalist unboxing guidelines.",
        "rules": {
            "banned_terms": [{"term": "plastic", "why": "Brand ethos", "preferred": "biodegradable packaging"}],
            "required_phrases": ["Kestrel Audio"],
            "tone_notes": ["sustainable", "modern"],
            "claim_rules": [],
        },
    }

    resp_creator = client.post("/guidelines", json=payload, headers=auth_headers["creator"])
    assert resp_creator.status_code == 403

    resp_reviewer = client.post("/guidelines", json=payload, headers=auth_headers["reviewer"])
    assert resp_reviewer.status_code == 403

    resp_manager = client.post("/guidelines", json=payload, headers=auth_headers["manager"])
    assert resp_manager.status_code == 201
    assert resp_manager.json()["title"] == "Packaging & Unboxing Voice"


def test_asset_creation_role_enforcement(client: TestClient, auth_headers):
    payload = {
        "title": "New Product Blog Draft",
        "body": "Introducing our latest acoustic innovation with crystal-clear fidelity.",
        "source_filename": "blog_draft.txt",
    }

    resp_reviewer = client.post("/assets", json=payload, headers=auth_headers["reviewer"])
    assert resp_reviewer.status_code == 403

    resp_creator = client.post("/assets", json=payload, headers=auth_headers["creator"])
    assert resp_creator.status_code == 201
    assert resp_creator.json()["title"] == "New Product Blog Draft"

    resp_mgr = client.post("/assets", json=payload, headers=auth_headers["manager"])
    assert resp_mgr.status_code == 201
