import pytest
from fastapi.testclient import TestClient


def test_list_facts(client: TestClient, auth_headers):
    resp = client.get("/facts", headers=auth_headers["creator"])
    assert resp.status_code == 200
    facts = resp.json()
    assert len(facts) >= 6

    keys = {f["key"] for f in facts}
    assert "price" in keys
    assert "battery_life_hours" in keys
    assert "warranty_months" in keys
    assert "return_window_days" in facts[0]["key"] or "return_window_days" in keys


def test_fact_versioning_flips_is_current(client: TestClient, auth_headers):
    list_resp = client.get("/facts", headers=auth_headers["manager"])
    assert list_resp.status_code == 200
    battery_fact = next(f for f in list_resp.json() if f["key"] == "battery_life_hours")
    fact_id = battery_fact["id"]

    assert battery_fact["current_version"]["version"] == 1
    assert battery_fact["current_version"]["value"] == "24"
    assert battery_fact["current_version"]["is_current"] is True

    version_payload = {
        "value": "28",
        "unit": "hours",
        "source_note": "Firmware update v2.0 optimized battery consumption to 28h",
    }
    forbidden_resp = client.post(
        f"/facts/{fact_id}/versions",
        json=version_payload,
        headers=auth_headers["creator"],
    )
    assert forbidden_resp.status_code == 403

    success_resp = client.post(
        f"/facts/{fact_id}/versions",
        json=version_payload,
        headers=auth_headers["manager"],
    )
    assert success_resp.status_code == 201
    v2 = success_resp.json()
    assert v2["version"] == 2
    assert v2["value"] == "28"
    assert v2["is_current"] is True

    detail_resp = client.get(f"/facts/{fact_id}", headers=auth_headers["manager"])
    assert detail_resp.status_code == 200
    fact_detail = detail_resp.json()

    assert fact_detail["current_version"]["version"] == 2
    assert fact_detail["current_version"]["value"] == "28"
    assert fact_detail["current_version"]["is_current"] is True

    versions = fact_detail["versions"]
    assert len(versions) == 2

    v1_record = next(v for v in versions if v["version"] == 1)
    v2_record = next(v for v in versions if v["version"] == 2)

    assert v1_record["is_current"] is False
    assert v1_record["value"] == "24"
    assert v2_record["is_current"] is True
    assert v2_record["value"] == "28"
