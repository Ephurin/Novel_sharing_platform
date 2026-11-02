"""P1-LIVE-FREE-02: Operator Preflight & Kill Switch Tool.

Validates environment configuration, checks Google AI Studio Free Tier settings,
verifies operator attestation, inspects quota ledger readback without exposing secrets,
and provides an authenticated emergency kill switch to disable live forwarding on the running gateway.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from typing import Any
import urllib.error
import urllib.request

APPROVED_LLM = {"gemini-3.5-flash-lite", "gemini-3.1-flash-lite"}
APPROVED_EMBED = {"gemini-embedding-2"}


def mask_key(key: str) -> str:
    if not key:
        return "[NOT SET]"
    hashed = hashlib.sha256(key.strip().encode("utf-8")).hexdigest()[:8]
    prefix = key[:6] if len(key) >= 10 else "***"
    return f"{prefix}... (sha256:{hashed})"


def run_preflight(
    state_file: str | None = None,
    attestation_file: str | None = None,
) -> int:
    mode = os.getenv("AI_EXECUTION_MODE", "offline_test").strip().lower()
    free_enabled = os.getenv("LIVE_FREE_TIER_ENABLED", "false").strip().lower() == "true"
    forwarding = os.getenv("LIVE_UPSTREAM_FORWARDING", "false").strip().lower() == "true"
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
    llm_model = os.getenv("LLM_MODEL", "gemini-3.5-flash-lite").removeprefix("models/").strip()
    embed_model = os.getenv("EMBEDDING_MODEL", "gemini-embedding-2").removeprefix("models/").strip()

    print("================================================================================")
    print("             P1-LIVE-FREE-02: OPERATOR PREFLIGHT VERIFICATION                   ")
    print("================================================================================")
    print(f"  Execution Profile:        {mode}")
    print(f"  Live Free Tier Enabled:   {free_enabled}")
    print(f"  Live Egress Forwarding:   {forwarding}")
    print(f"  Gemini API Credential:    {mask_key(api_key)}")
    print(f"  LLM Target Model:         {llm_model}")
    print(f"  Embedding Target Model:   {embed_model}")
    print("--------------------------------------------------------------------------------")

    issues: list[str] = []

    if mode not in {"offline_test", "live_free_tier", "live_paid"}:
        issues.append(f"Invalid AI_EXECUTION_MODE: '{mode}'")

    if llm_model not in APPROVED_LLM:
        issues.append(f"Unapproved LLM_MODEL '{llm_model}'. Must be in {APPROVED_LLM}")

    if embed_model not in APPROVED_EMBED:
        issues.append(f"Unapproved EMBEDDING_MODEL '{embed_model}'. Must be in {APPROVED_EMBED}")

    if "2.5" in llm_model or "2.5" in embed_model:
        issues.append("Gemini 2.5 is strictly prohibited under P1 acceptance requirements")

    # Check Free Tier Quotas
    gemini_rpm = int(os.getenv("FREE_TIER_GEMINI_RPM", "0"))
    gemini_tpm = int(os.getenv("FREE_TIER_GEMINI_TPM", "0"))
    gemini_rpd = int(os.getenv("FREE_TIER_GEMINI_RPD", "0"))
    embed_rpm = int(os.getenv("FREE_TIER_EMBEDDING_RPM", "0"))
    embed_tpm = int(os.getenv("FREE_TIER_EMBEDDING_TPM", "0"))
    embed_rpd = int(os.getenv("FREE_TIER_EMBEDDING_RPD", "0"))

    print(f"  Configured LLM Quotas:     {gemini_rpm} RPM | {gemini_tpm:,} TPM | {gemini_rpd} RPD")
    print(f"  Configured Embed Quotas:   {embed_rpm} RPM | {embed_tpm:,} TPM | {embed_rpd} RPD")

    if mode == "live_free_tier":
        if gemini_rpm <= 0 or gemini_tpm <= 0 or gemini_rpd <= 0:
            issues.append("QUOTA_CONFIG_REQUIRED: Missing or non-positive Gemini LLM quota limits")
        if embed_rpm <= 0 or embed_tpm <= 0 or embed_rpd <= 0:
            issues.append("QUOTA_CONFIG_REQUIRED: Missing or non-positive Gemini Embedding quota limits")

    # Attestation Check
    att_data: dict[str, Any] | None = None
    att_path = attestation_file or os.getenv("OPERATOR_ATTESTATION_FILE")
    if att_path and Path(att_path).is_file():
        try:
            att_data = json.loads(Path(att_path).read_text(encoding="utf-8"))
            now = time.time()
            exp = float(att_data.get("expires_at", 0))
            if not att_data.get("free_tier_confirmed"):
                issues.append("FREE_TIER_STATUS_UNVERIFIED: Attestation has free_tier_confirmed=false")
            if exp <= now:
                issues.append(f"FREE_TIER_STATUS_UNVERIFIED: Attestation expired at {exp} (now: {now})")
            print(f"  Operator Attestation:     Fingerprint={att_data.get('project_id_fingerprint')} (Valid until {exp})")
        except Exception as exc:
            issues.append(f"Failed to read operator attestation: {exc}")
    elif free_enabled:
        issues.append("FREE_TIER_STATUS_UNVERIFIED: LIVE_FREE_TIER_ENABLED is true but no valid operator attestation found")

    # Ledger State Readback
    if state_file and Path(state_file).is_file():
        try:
            raw = json.loads(Path(state_file).read_text(encoding="utf-8"))
            st = raw.get("state", raw)
            print("--------------------------------------------------------------------------------")
            print("  Authoritative Ledger State Readback:")
            print(f"    Schema:               {st.get('schema')}")
            print(f"    Guard Profile:        {st.get('guard_profile')}")
            print(f"    Run ID:               {st.get('run_id')}")
            print(f"    Live Free Tier:       {st.get('live_free_tier_enabled')}")
            print(f"    In-Flight Requests:   {st.get('current_in_flight', 0)}")
            print(f"    Today RPD Calls:      {st.get('rpd_call_count', 0)}")
            print(f"    Denied Requests:      {len(st.get('denied_history', []))}")
        except Exception as exc:
            issues.append(f"Failed to read authoritative ledger state: {exc}")

    print("================================================================================")
    if issues:
        print("  PREFLIGHT RESULT: FAILED (Resolve the following before proceeding):")
        for iss in issues:
            print(f"    [!] {iss}")
        print("================================================================================")
        return 1

    print("  PREFLIGHT RESULT: READY")
    if not free_enabled:
        print("  NOTICE: Live Free Tier is currently DISABLED by default.")
    if not forwarding:
        print("  NOTICE: Egress is configured for FAKE UPSTREAM (zero real API calls).")
    print("================================================================================")
    return 0


def trigger_kill_switch(
    gateway_url: str = "http://127.0.0.1:18090",
    operator_token: str | None = None,
    state_file: str | None = None,
    force_local: bool = False,
) -> int:
    print("================================================================================")
    print("            EMERGENCY KILL SWITCH: FORCING OFFLINE_TEST MODE                    ")
    print("================================================================================")
    token = operator_token or os.getenv("OPERATOR_AUTH_TOKEN", "").strip()
    url = (gateway_url or "").rstrip("/") + "/api/gateway/emergency/disable"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Operator-Token"] = token
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=b"{}", headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"  [OK] Successfully triggered kill switch on running gateway: {data}")
            print("  [OK] System returned to OFFLINE_TEST. All real upstream traffic is blocked.")
            print("================================================================================")
            return 0
    except urllib.error.HTTPError as exc:
        print(f"  [!] Gateway rejected kill switch with HTTP {exc.code}: {exc.read().decode('utf-8', errors='replace')}")
        print("================================================================================")
        return 1
    except Exception as exc:
        if force_local and state_file and Path(state_file).is_file():
            print(f"  [*] Running gateway not reachable ({exc}). Applying local durable disable via ledger...")
            try:
                try:
                    from Pipeline_test.tools.quota_controller import FreeTierQuotaLedger
                except ImportError:
                    from quota_controller import FreeTierQuotaLedger  # type: ignore[no-redef]
                ledger = FreeTierQuotaLedger(state_file, strict_fail_closed=True)
                ledger.set_live_free_tier_enabled(False)
                ledger.close()
                print("  [OK] Successfully disabled live_free_tier in authoritative ledger.")
                print("================================================================================")
                return 0
            except Exception as l_exc:
                print(f"  [!] Failed to update ledger locally: {l_exc}")
                print("================================================================================")
                return 1
        print(f"  [!] FAILED_TO_REACH_RUNNING_GATEWAY: {exc}")
        print("      To force local ledger update when gateway is not running, specify --force-local --state <path>")
        print("================================================================================")
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="P1 Free Tier Preflight & Kill Switch")
    parser.add_argument("--state", help="Path to authoritative quota ledger state file")
    parser.add_argument("--attestation-file", help="Path to operator attestation JSON file")
    parser.add_argument("--kill-switch", "--offline", action="store_true", help="Instantly abort to offline_test mode")
    parser.add_argument("--gateway-url", default="http://127.0.0.1:18090", help="URL of running safety gateway")
    parser.add_argument("--operator-token", help="Operator authorization secret token")
    parser.add_argument("--force-local", action="store_true", help="Allow updating local ledger if running gateway is unreachable")
    args = parser.parse_args()

    if args.kill_switch:
        return trigger_kill_switch(
            gateway_url=args.gateway_url,
            operator_token=args.operator_token,
            state_file=args.state,
            force_local=args.force_local,
        )

    return run_preflight(args.state, args.attestation_file)


if __name__ == "__main__":
    sys.exit(main())
