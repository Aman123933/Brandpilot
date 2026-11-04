import sys
import time
import httpx

BASE_URL = "http://127.0.0.1:8000"


def run_checks():
    run_id = int(time.time())
    client = httpx.Client(base_url=BASE_URL, timeout=10.0)
    print("--- 1. Testing Root and Health Endpoints ---")
    try:
        r_root = client.get("/")
    except (httpx.ConnectError, httpx.NetworkError):
        print("\n" + "=" * 60)
        print("ERROR: Could not connect to BrandPilot server at http://127.0.0.1:8000")
        print("The server is not currently running.")
        print("-" * 60)
        print("To fix this, start the server in a terminal:")
        print("    .venv\\Scripts\\uvicorn backend.app.main:app --reload --port 8000")
        print("\nThen run this verification script in another terminal:")
        print("    python verify_endpoints.py")
        print("=" * 60 + "\n")
        sys.exit(1)

    assert r_root.status_code == 200, f"Root failed: {r_root.text}"
    print(f"[OK] GET / -> {r_root.json()}")

    r_health = client.get("/health")
    assert r_health.status_code == 200, f"Health failed: {r_health.text}"
    print(f"[OK] GET /health -> {r_health.json()}")

    print("\n--- 2. Testing Auth Endpoints ---")
    r_users = client.get("/auth/demo-users")
    assert r_users.status_code == 200, f"List demo users failed: {r_users.text}"
    users = r_users.json()
    print(f"[OK] GET /auth/demo-users -> Retrieved {len(users)} users:")
    user_tokens = {}
    for u in users:
        print(f"     ID {u['id']}: {u['name']} ({u['role']})")
        r_login = client.post("/auth/demo-login", json={"user_id": u["id"]})
        assert r_login.status_code == 200, f"Login failed for {u['name']}: {r_login.text}"
        token = r_login.json()["access_token"]
        user_tokens[u["role"]] = {"Authorization": f"Bearer {token}"}
        print(f"     [OK] POST /auth/demo-login for user {u['id']} ({u['role']}) -> Token acquired")

    print("\n--- 3. Testing Facts Endpoints ---")
    r_facts = client.get("/facts", headers=user_tokens["creator"])
    assert r_facts.status_code == 200, f"Get facts failed: {r_facts.text}"
    facts = r_facts.json()
    print(f"[OK] GET /facts -> {len(facts)} facts found")

    r_fact_fail = client.post(
        "/facts",
        json={"key": "test_fact", "value": "test"},
        headers=user_tokens["creator"],
    )
    assert r_fact_fail.status_code == 403, f"Expected 403, got {r_fact_fail.status_code}"
    print(f"[OK] POST /facts as creator -> 403 Forbidden correctly enforced: {r_fact_fail.json()['detail']}")

    fact_key = f"waterproof_{run_id}"
    r_fact_succ = client.post(
        "/facts",
        json={
            "key": fact_key,
            "value": "IPX7",
            "unit": "IPX",
            "source_note": "IEC 60529 immersion certificate",
        },
        headers=user_tokens["brand_manager"],
    )
    assert r_fact_succ.status_code == 201, f"Create fact failed: {r_fact_succ.text}"
    created_fact = r_fact_succ.json()
    print(f"[OK] POST /facts as brand_manager -> 201 Created fact id {created_fact['id']} (key: {created_fact['key']})")

    fact_id = created_fact["id"]
    r_fact_detail = client.get(f"/facts/{fact_id}", headers=user_tokens["reviewer"])
    assert r_fact_detail.status_code == 200
    print(f"[OK] GET /facts/{fact_id} -> Fact loaded with {len(r_fact_detail.json()['versions'])} versions")

    r_fact_v2 = client.post(
        f"/facts/{fact_id}/versions",
        json={
            "value": "IPX8",
            "unit": "IPX",
            "source_note": "Updated continuous immersion certificate",
        },
        headers=user_tokens["brand_manager"],
    )
    assert r_fact_v2.status_code == 201
    v2_data = r_fact_v2.json()
    print(f"[OK] POST /facts/{fact_id}/versions as brand_manager -> 201 Created version {v2_data['version']} with is_current={v2_data['is_current']}")

    print("\n--- 4. Testing Guidelines Endpoints ---")
    r_guides = client.get("/guidelines", headers=user_tokens["creator"])
    assert r_guides.status_code == 200
    print(f"[OK] GET /guidelines -> {len(r_guides.json())} guidelines found")

    r_guide_fail = client.post(
        "/guidelines",
        json={"title": "Test Guideline", "body": "Body text", "rules": {}},
        headers=user_tokens["reviewer"],
    )
    assert r_guide_fail.status_code == 403
    print(f"[OK] POST /guidelines as reviewer -> 403 Forbidden correctly enforced: {r_guide_fail.json()['detail']}")

    guide_title = f"Packaging & Unboxing Voice {run_id}"
    r_guide_succ = client.post(
        "/guidelines",
        json={
            "title": guide_title,
            "body": "Eco-friendly, minimalist packaging communication rules.",
            "rules": {
                "banned_terms": [{"term": "plastic", "why": "Sustainability ethos", "preferred": "biodegradable"}],
                "required_phrases": ["Kestrel Audio"],
                "tone_notes": ["sustainable", "premium"],
                "claim_rules": [],
            },
        },
        headers=user_tokens["brand_manager"],
    )
    assert r_guide_succ.status_code == 201
    created_guide = r_guide_succ.json()
    print(f"[OK] POST /guidelines as brand_manager -> 201 Created guideline id {created_guide['id']} ('{created_guide['title']}')")

    guide_id = created_guide["id"]
    r_guide_detail = client.get(f"/guidelines/{guide_id}", headers=user_tokens["creator"])
    assert r_guide_detail.status_code == 200
    print(f"[OK] GET /guidelines/{guide_id} -> Guideline loaded with {len(r_guide_detail.json()['versions'])} versions")

    r_guide_v2 = client.post(
        f"/guidelines/{guide_id}/versions",
        json={
            "body": "Revised packaging copy rules v2.",
            "rules": {
                "banned_terms": [{"term": "single-use", "why": "Sustainability ethos", "preferred": "recyclable"}],
                "required_phrases": ["Kestrel Audio"],
                "tone_notes": ["sustainable"],
                "claim_rules": [],
            },
            "is_active": True,
        },
        headers=user_tokens["brand_manager"],
    )
    assert r_guide_v2.status_code == 201
    print(f"[OK] POST /guidelines/{guide_id}/versions as brand_manager -> 201 Created version {r_guide_v2.json()['version']}")

    print("\n--- 5. Testing Content Assets Endpoints ---")
    r_assets = client.get("/assets", headers=user_tokens["reviewer"])
    assert r_assets.status_code == 200
    print(f"[OK] GET /assets -> {len(r_assets.json())} content assets found")

    r_asset_fail = client.post(
        "/assets",
        json={"title": "Reviewer Draft", "body": "Draft content"},
        headers=user_tokens["reviewer"],
    )
    assert r_asset_fail.status_code == 403
    print(f"[OK] POST /assets as reviewer -> 403 Forbidden correctly enforced: {r_asset_fail.json()['detail']}")

    asset_title = f"Kestrel One Review Guide {run_id}"
    r_asset_succ = client.post(
        "/assets",
        json={
            "title": asset_title,
            "body": "A comprehensive review guide showcasing 24-hour battery life and Bluetooth 5.3.",
            "source_filename": "reviewer_guide.txt",
        },
        headers=user_tokens["creator"],
    )
    assert r_asset_succ.status_code == 201
    created_asset = r_asset_succ.json()
    print(f"[OK] POST /assets as creator -> 201 Created asset id {created_asset['id']} ('{created_asset['title']}')")

    asset_id = created_asset["id"]
    r_asset_detail = client.get(f"/assets/{asset_id}", headers=user_tokens["brand_manager"])
    assert r_asset_detail.status_code == 200
    print(f"[OK] GET /assets/{asset_id} -> Asset loaded with {len(r_asset_detail.json()['revisions'])} revisions")

    print("\n=======================================================")
    print("ALL ENDPOINT CHECKS COMPLETED SUCCESSFULLY!")
    print("=======================================================")


if __name__ == "__main__":
    run_checks()
