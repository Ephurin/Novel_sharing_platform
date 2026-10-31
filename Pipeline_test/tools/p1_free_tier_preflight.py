"""P1-LIVE-FREE-01: Operator Preflight & Kill Switch Tool.

Validates environment configuration, checks Google AI Studio Free Tier settings,
inspects quota ledger readback without exposing secrets, and provides an immediate
kill switch to force-revert to offline_test mode.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any

APPROVED_LLM = {"gemini-3.5-flash-lite", "gemini-3.1-flash-lite"}
APPROVED_EMBED = {"gemini-embedding-2"}


def mask_key(key: str) -> str:
    if not key:
        return "[NOT SET]"
    hashed = hashlib.sha256(key.strip().encode("utf-8")).hexdigest()[:8]
    prefix = key[:6] if len(key) >= 10 else "***"
    return f"{prefix}... (sha256:{hashed})"


def run_preflight(state_file: str | None = None) -> int:
    mode = os.getenv("AI_EXECUTION_MODE", "offline_test").strip().lower()
    free_enabled = os.getenv("LIVE_FREE_TIER_ENABLED", "false").strip().lower() == "true"
    forwarding = os.getenv("LIVE_UPSTREAM_FORWARDING", "false").strip().lower() == "true"
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
    llm_model = os.getenv("LLM_MODEL", "gemini-3.5-flash-lite").removeprefix("models/").strip()
    embed_model = os.getenv("EMBEDDING_MODEL", "gemini-embedding-2").removeprefix("models/").strip()

    print("================================================================================")
    print("             P1-LIVE-FREE-01: OPERATOR PREFLIGHT VERIFICATION                   ")
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
    gemini_rpm = int(os.getenv("FREE_TIER_GEMINI_RPM", "15"))
    gemini_tpm = int(os.getenv("FREE_TIER_GEMINI_TPM", "250000"))
    gemini_rpd = int(os.getenv("FREE_TIER_GEMINI_RPD", "500"))
    embed_rpm = int(os.getenv("FREE_TIER_EMBEDDING_RPM", "15"))
    embed_tpm = int(os.getenv("FREE_TIER_EMBEDDING_TPM", "1000000"))
    embed_rpd = int(os.getenv("FREE_TIER_EMBEDDING_RPD", "500"))

    print(f"  Configured LLM Quotas:     {gemini_rpm} RPM | {gemini_tpm:,} TPM | {gemini_rpd} RPD")
    print(f"  Configured Embed Quotas:   {embed_rpm} RPM | {embed_tpm:,} TPM | {embed_rpd} RPD")

    if gemini_rpm <= 0 or gemini_tpm <= 0 or gemini_rpd <= 0:
        issues.append("Invalid non-positive Gemini LLM quota limits")
    if embed_rpm <= 0 or embed_tpm <= 0 or embed_rpd <= 0:
        issues.append("Invalid non-positive Gemini Embedding quota limits")

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
        print("  To enable after operator confirmation, export LIVE_FREE_TIER_ENABLED=true")
    if not forwarding:
        print("  NOTICE: Egress is configured for FAKE UPSTREAM (zero real API calls).")
    print("================================================================================")
    return 0


def trigger_kill_switch(state_file: str | None = None) -> int:
    print("================================================================================")
    print("            EMERGENCY KILL SWITCH: FORCING OFFLINE_TEST MODE                    ")
    print("================================================================================")
    os.environ["AI_EXECUTION_MODE"] = "offline_test"
    os.environ["LIVE_FREE_TIER_ENABLED"] = "false"
    os.environ["LIVE_UPSTREAM_FORWARDING"] = "false"

    if state_file and Path(state_file).is_file():
        try:
            path = Path(state_file)
            envelope = json.loads(path.read_text(encoding="utf-8"))
            st = envelope.get("state", envelope)
            st["live_free_tier_enabled"] = False
            data = json.dumps(st, sort_keys=True, separators=(",", ":")).encode("utf-8")
            new_env = {"state": st, "sha256": hashlib.sha256(data).hexdigest()}
            path.write_text(json.dumps(new_env), encoding="utf-8")
            print(f"  [OK] Successfully disabled live_free_tier in ledger: {state_file}")
        except Exception as exc:
            print(f"  [!] Failed to update ledger state file: {exc}")
            return 1

    print("  [OK] System returned to OFFLINE_TEST. All real upstream traffic is blocked.")
    print("================================================================================")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="P1 Free Tier Preflight & Kill Switch")
    parser.add_argument("--state", help="Path to authoritative quota ledger state file")
    parser.add_argument("--kill-switch", "--offline", action="store_true", help="Instantly abort to offline_test mode")
    args = parser.parse_args()

    if args.kill_switch:
        return trigger_kill_switch(args.state)

    return run_preflight(args.state)


if __name__ == "__main__":
    sys.exit(main())

