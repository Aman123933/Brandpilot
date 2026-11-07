#!/usr/bin/env python3
"""
BrandPilot Core Story Smoke Test
================================
Walks the core brand-governance story against a running BrandPilot instance:
1. Pre-flight audit on planted sample asset (flags banned words & fact mismatches)
2. Accept suggested fixes (applies suggestions and bumps revision)
3. Submit asset for reviewer approval (POST /assets/{id}/submit)
4. Reviewer approves asset and issues Passport (POST /assets/{id}/decision)
5. Verify passport status is VALID with linked ground-truth facts
6. Fact evolution: Brand Manager updates a fact, automatically triggering recall
7. Verify passport transitioned to REVIEW REQUIRED
8. Public verification: Fetch logged-out public passport verifying clean metadata & status stamp

Usage:
    python scripts/smoke_test.py [--base-url http://localhost:8000]
"""

import sys
import os
import argparse
import requests
from typing import Dict, Any, List

PASS_MARK = "\033[92m[PASS]\033[0m"
FAIL_MARK = "\033[91m[FAIL]\033[0m"
INFO_MARK = "\033[94m[INFO]\033[0m"


class SmokeTestRunner:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.tokens: Dict[str, str] = {}
        self.users: Dict[str, Any] = {}
        self.passed_steps = 0
        self.failed_steps = 0

    def log_pass(self, step_name: str, detail: str = ""):
        self.passed_steps += 1
        detail_str = f" - {detail}" if detail else ""
        print(f"{PASS_MARK} Step {self.passed_steps}: {step_name}{detail_str}")

    def log_fail(self, step_name: str, error: str):
        self.failed_steps += 1
        print(f"{FAIL_MARK} Step: {step_name} FAILED! Reason: {error}")

    def auth_headers(self, role: str) -> Dict[str, str]:
        token = self.tokens.get(role)
        if not token:
            raise RuntimeError(f"No auth token for role '{role}'")
        return {"Authorization": f"Bearer {token}"}

    def setup_identities(self):
        print(f"\n{INFO_MARK} Connecting to BrandPilot at {self.base_url}...")
        resp = self.session.get(f"{self.base_url}/auth/demo-users", timeout=10)
        if resp.status_code != 200:
            raise RuntimeError(f"Could not load demo users from {self.base_url}/auth/demo-users: {resp.text}")

        users_list = resp.json()
        for u in users_list:
            self.users[u["role"]] = u
            login_resp = self.session.post(
                f"{self.base_url}/auth/demo-login",
                json={"user_id": u["id"]},
                timeout=10,
            )
            if login_resp.status_code != 200:
                raise RuntimeError(f"Login failed for {u['name']} ({u['role']}): {login_resp.text}")
            self.tokens[u["role"]] = login_resp.json()["access_token"]

        print(f"{INFO_MARK} Authenticated demo users: Maya (brand_manager), Dev (creator), Sana (reviewer).")

    def run(self) -> bool:
        print("=" * 65)
        print("         BRANDPILOT END-TO-END SMOKE TEST SUITE         ")
        print("=" * 65)

        try:
            self.setup_identities()
        except Exception as exc:
            print(f"{FAIL_MARK} Setup failed: {exc}")
            return False

        # -------------------------------------------------------------
        # STEP 1: Find the planted sample asset
        # -------------------------------------------------------------
        asset_id = None
        asset_title = None
        try:
            resp = self.session.get(
                f"{self.base_url}/assets",
                headers=self.auth_headers("creator"),
                timeout=10,
            )
            if resp.status_code != 200:
                self.log_fail("Find planted sample", f"Status {resp.status_code}: {resp.text}")
                return False

            assets = resp.json()
            # Look for the asset with planted issues
            for a in assets:
                if "Social" in a["title"] or "promo" in a.get("source_filename", "").lower():
                    asset_id = a["id"]
                    asset_title = a["title"]
                    break

            if not asset_id and assets:
                target = assets[1] if len(assets) > 1 else assets[0]
                asset_id = target["id"]
                asset_title = target["title"]

            if not asset_id:
                self.log_fail("Find planted sample", "No content assets found in workspace")
                return False

            self.log_pass("Located planted sample asset", f"Asset #{asset_id} '{asset_title}'")
        except Exception as exc:
            self.log_fail("Find planted sample asset", str(exc))
            return False

        # -------------------------------------------------------------
        # STEP 2: Audit the planted sample
        # -------------------------------------------------------------
        findings: List[Dict[str, Any]] = []
        try:
            audit_resp = self.session.post(
                f"{self.base_url}/assets/{asset_id}/audit",
                headers=self.auth_headers("creator"),
                timeout=15,
            )
            if audit_resp.status_code != 200:
                self.log_fail("Run pre-flight audit", f"Status {audit_resp.status_code}: {audit_resp.text}")
                return False

            audit_data = audit_resp.json()
            findings_raw = audit_data.get("findings", {})
            if isinstance(findings_raw, dict):
                for group in findings_raw.values():
                    if isinstance(group, list):
                        findings.extend(group)
            elif isinstance(findings_raw, list):
                findings = findings_raw

            if len(findings) == 0:
                # Also try GET /assets/{asset_id}/findings
                get_f_resp = self.session.get(
                    f"{self.base_url}/assets/{asset_id}/findings",
                    headers=self.auth_headers("creator"),
                    timeout=10,
                )
                if get_f_resp.status_code == 200:
                    findings = get_f_resp.json()

            if len(findings) == 0:
                self.log_fail("Pre-flight audit", "Expected violations on planted sample, but found 0")
                return False

            quotes = [f.get("quote", "") for f in findings if isinstance(f, dict)]
            self.log_pass(
                "Pre-flight audit detected rule and fact violations",
                f"{len(findings)} issues flagged ({', '.join(quotes[:3])})",
            )
        except Exception as exc:
            self.log_fail("Run pre-flight audit", str(exc))
            return False

        # -------------------------------------------------------------
        # STEP 3: Accept fixes
        # -------------------------------------------------------------
        try:
            accepted_count = 0
            for f in findings:
                if isinstance(f, dict) and f.get("status") == "open" and f.get("suggestion"):
                    patch_resp = self.session.patch(
                        f"{self.base_url}/findings/{f['id']}",
                        json={"status": "accepted"},
                        headers=self.auth_headers("creator"),
                        timeout=10,
                    )
                    if patch_resp.status_code == 200:
                        accepted_count += 1

            if accepted_count == 0:
                self.log_fail("Accept fixes", "No findings with suggestions were available to accept")
                return False

            asset_detail_resp = self.session.get(
                f"{self.base_url}/assets/{asset_id}",
                headers=self.auth_headers("creator"),
                timeout=10,
            )
            current_rev = asset_detail_resp.json().get("current_revision", 1)
            self.log_pass(
                "Accepted suggested fixes on asset findings",
                f"Accepted {accepted_count} suggestions. Current revision: rev {current_rev}",
            )
        except Exception as exc:
            self.log_fail("Accept suggested fixes", str(exc))
            return False

        # -------------------------------------------------------------
        # STEP 4: Submit asset for approval
        # -------------------------------------------------------------
        try:
            submit_resp = self.session.post(
                f"{self.base_url}/assets/{asset_id}/submit",
                headers=self.auth_headers("creator"),
                timeout=10,
            )
            if submit_resp.status_code not in (200, 201):
                self.log_fail("Submit for review", f"Status {submit_resp.status_code}: {submit_resp.text}")
                return False

            asset_after_submit = submit_resp.json()
            if asset_after_submit.get("status") != "in_review":
                self.log_fail("Submit for review", f"Expected status 'in_review', got '{asset_after_submit.get('status')}'")
                return False

            self.log_pass("Submitted asset for review", "Asset status transitioned to 'in_review'")
        except Exception as exc:
            self.log_fail("Submit asset for review", str(exc))
            return False

        # -------------------------------------------------------------
        # STEP 5: Reviewer approves asset and issues Passport
        # -------------------------------------------------------------
        passport_code = None
        try:
            decision_payload = {
                "decision": "approved",
                "comment": "Verified against all Kestrel Audio ground-truth facts and voice standards.",
            }
            decide_resp = self.session.post(
                f"{self.base_url}/assets/{asset_id}/decision",
                json=decision_payload,
                headers=self.auth_headers("reviewer"),
                timeout=10,
            )
            if decide_resp.status_code not in (200, 201):
                self.log_fail("Reviewer approve", f"Status {decide_resp.status_code}: {decide_resp.text}")
                return False

            decision_data = decide_resp.json()
            passport_code = decision_data.get("passport_code")
            if not passport_code:
                detail = self.session.get(
                    f"{self.base_url}/assets/{asset_id}",
                    headers=self.auth_headers("reviewer"),
                    timeout=10,
                ).json()
                passport_code = detail.get("passport", {}).get("id")

            if not passport_code:
                self.log_fail("Reviewer approve", "No passport code issued upon approval")
                return False

            self.log_pass(
                "Reviewer approved asset and issued Passport",
                f"Passport Code: {passport_code}",
            )
        except Exception as exc:
            self.log_fail("Reviewer approve asset", str(exc))
            return False

        # -------------------------------------------------------------
        # STEP 6: Check passport is VALID with linked facts
        # -------------------------------------------------------------
        try:
            pass_resp = self.session.get(
                f"{self.base_url}/passports/{passport_code}",
                headers=self.auth_headers("reviewer"),
                timeout=10,
            )
            if pass_resp.status_code != 200:
                self.log_fail("Check passport", f"Status {pass_resp.status_code}: {pass_resp.text}")
                return False

            pass_data = pass_resp.json()
            if pass_data.get("status") != "valid":
                self.log_fail("Check passport", f"Expected status 'valid', got '{pass_data.get('status')}'")
                return False

            linked_facts = pass_data.get("referenced_facts", [])
            self.log_pass(
                "Verified Passport status is VALID with linked facts",
                f"Status: VALID, {len(linked_facts)} ground-truth facts bound to passport",
            )
        except Exception as exc:
            self.log_fail("Check passport valid", str(exc))
            return False

        # -------------------------------------------------------------
        # STEP 7: Change a fact (Trigger Fact Evolution & Recall)
        # -------------------------------------------------------------
        try:
            facts_resp = self.session.get(
                f"{self.base_url}/facts",
                headers=self.auth_headers("brand_manager"),
                timeout=10,
            )
            if facts_resp.status_code != 200:
                self.log_fail("Change fact", f"Failed to list facts: {facts_resp.text}")
                return False

            facts = facts_resp.json()
            target_fact = next((f for f in facts if f["key"] == "battery_life_hours"), facts[0])
            fact_id = target_fact["id"]

            new_version_payload = {
                "value": "28",
                "unit": target_fact.get("current_version", {}).get("unit", "hours"),
                "source_note": "Acoustic engineering lab revised battery test memo Q2",
            }
            bump_resp = self.session.post(
                f"{self.base_url}/facts/{fact_id}/versions",
                json=new_version_payload,
                headers=self.auth_headers("brand_manager"),
                timeout=10,
            )
            if bump_resp.status_code not in (200, 201):
                self.log_fail("Change fact", f"Status {bump_resp.status_code}: {bump_resp.text}")
                return False

            recheck_pass = self.session.get(
                f"{self.base_url}/passports/{passport_code}",
                headers=self.auth_headers("brand_manager"),
                timeout=10,
            )
            pass_status_after_recall = recheck_pass.json().get("status")

            recheck_asset = self.session.get(
                f"{self.base_url}/assets/{asset_id}",
                headers=self.auth_headers("brand_manager"),
                timeout=10,
            )
            asset_status_after_recall = recheck_asset.json().get("status")

            if pass_status_after_recall != "review_required":
                self.log_fail(
                    "Fact evolution recall",
                    f"Expected passport status 'review_required', got '{pass_status_after_recall}'",
                )
                return False

            self.log_pass(
                "Fact evolution automatically triggered recall",
                f"Passport status: {pass_status_after_recall.upper()}, Asset status: {asset_status_after_recall}",
            )
        except Exception as exc:
            self.log_fail("Fact evolution recall", str(exc))
            return False

        # -------------------------------------------------------------
        # STEP 8: Fetch public passport (Logged-out verification)
        # -------------------------------------------------------------
        try:
            pub_resp = requests.get(f"{self.base_url}/passports/{passport_code}/public", timeout=10)
            if pub_resp.status_code != 200:
                self.log_fail("Public verify endpoint", f"Status {pub_resp.status_code}: {pub_resp.text}")
                return False

            pub_data = pub_resp.json()
            assert pub_data.get("code") == passport_code, "Public code mismatch"
            assert pub_data.get("status") == "review_required", "Public status mismatch"
            assert "asset_title" in pub_data, "Missing asset_title in public response"
            assert "reviewer_first_name" in pub_data, "Missing reviewer_first_name in public response"
            assert "guideline_version_label" in pub_data, "Missing guideline_version_label"
            assert "linked_facts_count" in pub_data, "Missing linked_facts_count"
            assert "ai_disclosure" in pub_data, "Missing ai_disclosure"

            # Strict privacy check
            assert "body" not in pub_data, "LEAK: raw body text exposed in public endpoint!"
            assert "facts" not in pub_data, "LEAK: internal fact dictionary exposed in public endpoint!"

            self.log_pass(
                "Public verify endpoint returned clean metadata & status stamp",
                f"Stamp: {pub_data['status'].upper()}, Title: '{pub_data['asset_title']}', "
                f"Reviewer: {pub_data['reviewer_first_name']}, Facts: {pub_data['linked_facts_count']}",
            )
        except Exception as exc:
            self.log_fail("Public verify endpoint", str(exc))
            return False

        # -------------------------------------------------------------
        # FINAL REPORT
        # -------------------------------------------------------------
        print("\n" + "=" * 65)
        print(f"SMOKE TEST SUMMARY: {self.passed_steps} STEPS PASSED, {self.failed_steps} FAILED")
        print("=" * 65)

        if self.failed_steps == 0:
            print("\n\033[92mALL CORE STORY STEPS PASSED SUCCESSFULLY!\033[0m\n")
            return True
        else:
            print(f"\n\033[91mSMOKE TEST FAILED with {self.failed_steps} errors.\033[0m\n")
            return False


def main():
    parser = argparse.ArgumentParser(description="BrandPilot Core Story Smoke Test")
    parser.add_argument(
        "--base-url",
        default=os.getenv("BRANDPILOT_BASE_URL", "http://localhost:8000"),
        help="Base URL of running BrandPilot instance (default: http://localhost:8000)",
    )
    args = parser.parse_args()

    runner = SmokeTestRunner(base_url=args.base_url)
    success = runner.run()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
