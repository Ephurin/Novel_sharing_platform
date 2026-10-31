"""P1-LIVE-FREE-01: Shared Quota Controller & Durable Ledger for Gemini Free Tier.

Enforces quota-aware admission for Google AI Studio Free Tier:
- Requests Per Minute (RPM) sliding window with configurable headroom
- Input Tokens Per Minute (TPM) pre-reservation and post-response reconciliation
- Requests Per Day (RPD) with calendar day reset (UTC midnight)
- Bounded in-flight concurrency semaphore
- Bounded request deadline and retry limits
- Atomic OS file locking across Python and Node workers
- Fail-closed durability with SHA-256 state verification
"""
from __future__ import annotations

import copy
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import random
import threading
import time
from typing import Any
import uuid


class QuotaExceededError(Exception):
    """Base exception for quota admission denials."""


class RPMLimitExceeded(QuotaExceededError):
    """Raised when the requests-per-minute ceiling is reached."""


class TPMLimitExceeded(QuotaExceededError):
    """Raised when the input tokens-per-minute ceiling is reached."""


class RPDLimitExceeded(QuotaExceededError):
    """Raised when the daily request limit is reached."""


class ConcurrencyLimitExceeded(QuotaExceededError):
    """Raised when max in-flight concurrent requests is reached."""


class QuotaMeterUnavailableError(RuntimeError):
    """Raised when the ledger is missing, corrupted, locked, or fail-closed."""


class FreeTierStatusUnverifiedError(RuntimeError):
    """Raised when operator preflight has not verified Google AI Studio Free Tier status."""


class QuotaConfigRequiredError(ValueError):
    """Raised when mandatory quota parameters are missing or invalid."""


# Approved model identifiers for Free Tier
APPROVED_LLM_MODELS = frozenset({"gemini-3.5-flash-lite", "gemini-3.1-flash-lite"})
APPROVED_EMBEDDING_MODELS = frozenset({"gemini-embedding-2"})
ALL_APPROVED_MODELS = APPROVED_LLM_MODELS | APPROVED_EMBEDDING_MODELS

# Default published quotas for Google AI Studio Free Tier
DEFAULT_MODEL_QUOTAS = {
    "gemini-3.5-flash-lite": {
        "rpm": 15,
        "tpm": 250_000,
        "rpd": 500,
        "max_concurrency": 2,
        "headroom": 0.10,  # 10% safety margin below published rate limit
    },
    "gemini-3.1-flash-lite": {
        "rpm": 15,
        "tpm": 250_000,
        "rpd": 500,
        "max_concurrency": 2,
        "headroom": 0.10,
    },
    "gemini-embedding-2": {
        "rpm": 15,
        "tpm": 1_000_000,
        "rpd": 500,
        "max_concurrency": 2,
        "headroom": 0.10,
    },
}


def _get_next_utc_midnight(now_ts: float) -> float:
    """Calculate the Unix timestamp of the next 00:00:00 UTC."""
    dt = datetime.fromtimestamp(now_ts, tz=timezone.utc)
    # Next day at 00:00:00 UTC
    next_day = dt.date().toordinal() + 1
    next_midnight = datetime.fromordinal(next_day).replace(tzinfo=timezone.utc)
    return next_midnight.timestamp()


class FreeTierQuotaLedger:
    """Shared, OS-locked, durable ledger tracking Free Tier RPM, TPM, RPD, and concurrency."""

    def __init__(
        self,
        state_file: str | Path,
        *,
        run_id: str | None = None,
        live_free_tier_enabled: bool = False,
        model_quotas: dict[str, dict[str, Any]] | None = None,
        strict_fail_closed: bool = True,
        initialize: bool = False,
        in_flight_timeout_seconds: float = 120.0,
    ) -> None:
        self.state_file = Path(state_file)
        self.in_flight_timeout_seconds = in_flight_timeout_seconds
        self._lock = threading.RLock()
        self._owner: Any = None
        self._init_error: QuotaMeterUnavailableError | None = None
        self._initializing = False
        self.state: dict[str, Any] = {}

        try:
            if not strict_fail_closed:
                raise QuotaMeterUnavailableError("Fail-open mode is strictly forbidden")

            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            self._owner = open(str(self.state_file) + ".lock", "a+b")
            if os.name == "nt":
                import msvcrt

                self._owner.seek(0)
                self._owner.write(b"0")
                self._owner.flush()
                self._owner.seek(0)
                msvcrt.locking(self._owner.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self._owner, fcntl.LOCK_EX | fcntl.LOCK_NB)

            marker = Path(str(self.state_file) + ".initialized")

            if not self.state_file.exists():
                if not initialize or marker.exists():
                    raise QuotaMeterUnavailableError("MISSING_AUTHORITATIVE_QUOTA_LEDGER")
                if not run_id:
                    raise QuotaMeterUnavailableError("Explicit run_id required for initialization")

                merged_quotas: dict[str, dict[str, Any]] = copy.deepcopy(DEFAULT_MODEL_QUOTAS)
                if model_quotas:
                    for model_name, cfg in model_quotas.items():
                        norm_name = model_name.removeprefix("models/").strip()
                        if norm_name in merged_quotas:
                            merged_quotas[norm_name].update(cfg)
                        else:
                            merged_quotas[norm_name] = copy.deepcopy(cfg)

                # Validate quota values
                for m_name, q in merged_quotas.items():
                    rpm = q.get("rpm", 0)
                    tpm = q.get("tpm", 0)
                    rpd = q.get("rpd", 0)
                    conc = q.get("max_concurrency", 0)
                    if rpm <= 0 or tpm <= 0 or rpd <= 0 or conc <= 0:
                        raise QuotaConfigRequiredError(f"Invalid quota configuration for {m_name}")

                now = time.time()
                next_midnight = _get_next_utc_midnight(now)

                self.state = {
                    "schema": 4,
                    "guard_profile": "P1_LIVE_FREE_TIER_01",
                    "run_id": run_id,
                    "live_free_tier_enabled": bool(live_free_tier_enabled),
                    "started": now,
                    "rpd_reset_timestamp": next_midnight,
                    "model_quotas": merged_quotas,
                    "current_in_flight": 0,
                    "in_flight_tickets": {},
                    "rpd_call_count": 0,
                    "call_history": [],
                    "denied_history": [],
                }
                self._initializing = True
                try:
                    with marker.open("x", encoding="utf-8") as stream:
                        json.dump(
                            {"run_id": run_id, "guard_profile": "P1_LIVE_FREE_TIER_01"},
                            stream,
                        )
                        stream.flush()
                        os.fsync(stream.fileno())
                    self._save_durable()
                finally:
                    self._initializing = False
            else:
                self.state = self._read_verified()
                if not marker.is_file():
                    raise QuotaMeterUnavailableError("MISSING_LEDGER_MARKER")
                marker_data = json.loads(marker.read_text(encoding="utf-8"))
                if marker_data.get("run_id") != self.state.get("run_id"):
                    raise QuotaMeterUnavailableError("LEDGER_MARKER_MISMATCH")
        except Exception as exc:
            self._init_error = QuotaMeterUnavailableError(str(exc))
            if strict_fail_closed:
                raise self._init_error

    def close(self) -> None:
        if self._owner:
            try:
                self._owner.close()
            except Exception:
                pass
            self._owner = None

    def _read_verified(self) -> dict[str, Any]:
        if not self.state_file.is_file():
            raise QuotaMeterUnavailableError("MISSING_AUTHORITATIVE_QUOTA_LEDGER")
        marker = Path(str(self.state_file) + ".initialized")
        if not marker.is_file():
            raise QuotaMeterUnavailableError("MISSING_LEDGER_MARKER")
        try:
            envelope = json.loads(self.state_file.read_text(encoding="utf-8"))
        except Exception as exc:
            raise QuotaMeterUnavailableError(f"CORRUPT_LEDGER_JSON: {exc}") from exc

        if not isinstance(envelope, dict) or "state" not in envelope or "sha256" not in envelope:
            raise QuotaMeterUnavailableError("INVALID_LEDGER_ENVELOPE")

        data = envelope["state"]
        encoded = json.dumps(data, sort_keys=True, separators=(",", ":")).encode("utf-8")
        if envelope.get("sha256") != hashlib.sha256(encoded).hexdigest() or data.get("schema") != 4:
            raise QuotaMeterUnavailableError("CORRUPT_OR_SCHEMA_MISMATCH_QUOTA_LEDGER")

        if data.get("guard_profile") != "P1_LIVE_FREE_TIER_01":
            raise QuotaMeterUnavailableError("INVALID_GUARD_PROFILE_FOR_FREE_TIER")

        # Validate internal counters consistency
        in_flight = data.get("in_flight_tickets", {})
        if not isinstance(in_flight, dict):
            raise QuotaMeterUnavailableError("INVALID_IN_FLIGHT_STATE")

        if data.get("current_in_flight") != len(in_flight):
            raise QuotaMeterUnavailableError("IN_FLIGHT_COUNTER_MISMATCH")

        return data

    def _healthy(self) -> None:
        with self._lock:
            if self._init_error:
                raise self._init_error
            if not self.state_file.is_file():
                self._init_error = QuotaMeterUnavailableError("MISSING_AUTHORITATIVE_QUOTA_LEDGER")
                raise self._init_error
            try:
                verified = self._read_verified()
                if verified != self.state:
                    raise QuotaMeterUnavailableError("AUTHORITATIVE_LEDGER_CHANGED_EXTERNALLY")
            except Exception as exc:
                self._init_error = QuotaMeterUnavailableError(str(exc))
                raise self._init_error

    def _save_durable(self) -> None:
        if self._init_error:
            raise self._init_error
        if not getattr(self, "_initializing", False) and not self.state_file.is_file():
            self._init_error = QuotaMeterUnavailableError("MISSING_AUTHORITATIVE_QUOTA_LEDGER")
            raise self._init_error

        temporary = self.state_file.with_name(
            self.state_file.name + ".tmp-" + uuid.uuid4().hex
        )
        try:
            data = json.dumps(self.state, sort_keys=True, separators=(",", ":")).encode("utf-8")
            envelope = {"state": self.state, "sha256": hashlib.sha256(data).hexdigest()}
            with temporary.open("xb") as stream:
                stream.write(json.dumps(envelope).encode("utf-8"))
                stream.flush()
                os.fsync(stream.fileno())

            for attempt in range(8):
                try:
                    os.replace(temporary, self.state_file)
                    break
                except PermissionError:
                    if attempt == 7:
                        raise
                    time.sleep(0.01 * (2**attempt))

            if os.name != "nt":
                parent_fd = os.open(str(self.state_file.parent), os.O_RDONLY)
                try:
                    os.fsync(parent_fd)
                finally:
                    os.close(parent_fd)
        except Exception as exc:
            self._init_error = QuotaMeterUnavailableError(f"QUOTA_LEDGER_DURABILITY_FAILURE: {exc}")
            raise self._init_error from exc
        finally:
            if temporary.exists():
                try:
                    temporary.unlink()
                except Exception:
                    pass

    def _cleanup_stale_in_flight(self, now: float) -> bool:
        """Mark stale in-flight tickets as TIMEOUT if they exceeded max duration."""
        changed = False
        in_flight = self.state.get("in_flight_tickets", {})
        expired_ids: list[str] = []
        for tid, entry in in_flight.items():
            start_ts = float(entry.get("start_time", 0))
            if (now - start_ts) > self.in_flight_timeout_seconds:
                expired_ids.append(tid)

        for tid in expired_ids:
            entry = in_flight.pop(tid)
            # Find and update corresponding call_history entry
            for h in self.state.get("call_history", []):
                if h.get("ticket_id") == tid and h.get("status") == "RESERVED":
                    h["status"] = "TIMEOUT"
                    h["finished_time"] = now
                    break
            changed = True

        if changed:
            self.state["current_in_flight"] = len(in_flight)
        return changed

    def reserve(
        self,
        *,
        model: str,
        estimated_input_tokens: int = 1000,
        client_service: str = "unknown",
        operation: str = "generic",
        now_override: float | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._healthy()

            s = self.state
            now = float(now_override) if now_override is not None else time.time()

            # 1. Verification of operator enablement
            if not s.get("live_free_tier_enabled"):
                self.record_denial("FREE_TIER_STATUS_UNVERIFIED", client_service, operation)
                raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED")

            # 2. Model normalization and verification
            normalized_model = str(model or "").strip().removeprefix("models/")
            if normalized_model not in ALL_APPROVED_MODELS:
                self.record_denial("MODEL_NOT_APPROVED", client_service, operation)
                raise ValueError(f"MODEL_NOT_APPROVED: {normalized_model}")

            quotas = s.get("model_quotas", {}).get(normalized_model)
            if not quotas:
                self.record_denial("QUOTA_CONFIG_REQUIRED", client_service, operation)
                raise QuotaConfigRequiredError(f"Missing quota config for model {normalized_model}")

            # 3. Clean up stale in-flight reservations
            self._cleanup_stale_in_flight(now)

            # 4. Check and execute daily RPD reset (midnight UTC)
            if now >= float(s.get("rpd_reset_timestamp", 0)):
                s["rpd_call_count"] = 0
                s["rpd_reset_timestamp"] = _get_next_utc_midnight(now)

            headroom = float(quotas.get("headroom", 0.10))
            effective_rpm = max(1, int(math.floor(float(quotas["rpm"]) * (1.0 - headroom))))
            effective_tpm = max(1, int(math.floor(float(quotas["tpm"]) * (1.0 - headroom))))
            effective_rpd = max(1, int(math.floor(float(quotas["rpd"]) * (1.0 - headroom))))
            max_concurrency = int(quotas.get("max_concurrency", 2))

            # 5. Concurrency check
            if s["current_in_flight"] >= max_concurrency:
                self.record_denial("CONCURRENCY_LIMIT_EXCEEDED", client_service, operation)
                raise ConcurrencyLimitExceeded("CONCURRENCY_LIMIT_EXCEEDED")

            # 6. Daily limit check (RPD)
            if s["rpd_call_count"] >= effective_rpd:
                self.record_denial("RPD_LIMIT_EXCEEDED", client_service, operation)
                raise RPDLimitExceeded("RPD_LIMIT_EXCEEDED")

            # 7. Sliding-window RPM check (last 60 seconds for this model)
            window_seconds = 60.0
            window_start = now - window_seconds
            recent_model_calls = [
                e for e in s["call_history"]
                if e.get("model") == normalized_model and float(e.get("timestamp", 0)) >= window_start
            ]
            if len(recent_model_calls) >= effective_rpm:
                self.record_denial("RPM_LIMIT_EXCEEDED", client_service, operation)
                raise RPMLimitExceeded("RPM_LIMIT_EXCEEDED")

            # 8. Sliding-window TPM check (input tokens in last 60s + reserved + estimated)
            consumed_tokens = sum(
                int(e.get("input_tokens", 0))
                for e in recent_model_calls
                if e.get("status") != "RESERVED"
            )
            in_flight_tokens = sum(
                int(entry.get("reserved_tokens", 0))
                for entry in s["in_flight_tickets"].values()
                if entry.get("model") == normalized_model
            )
            estimated_tokens = max(1, int(estimated_input_tokens))
            if (consumed_tokens + in_flight_tokens + estimated_tokens) > effective_tpm:
                self.record_denial("TPM_LIMIT_EXCEEDED", client_service, operation)
                raise TPMLimitExceeded("TPM_LIMIT_EXCEEDED")

            # All admission checks passed — create reservation
            ticket_id = uuid.uuid4().hex
            ticket = {
                "ticket_id": ticket_id,
                "call_index": len(s["call_history"]) + 1,
                "model": normalized_model,
                "client_service": client_service,
                "operation": operation,
                "reserved_tokens": estimated_tokens,
                "input_tokens": estimated_tokens,
                "timestamp": now,
                "status": "RESERVED",
            }

            s["in_flight_tickets"][ticket_id] = {
                "model": normalized_model,
                "reserved_tokens": estimated_tokens,
                "start_time": now,
                "client_service": client_service,
                "operation": operation,
            }
            s["current_in_flight"] = len(s["in_flight_tickets"])
            s["rpd_call_count"] += 1
            s["call_history"].append(copy.deepcopy(ticket))

            self._save_durable()
            return ticket

    def finalize(
        self,
        ticket_id: str,
        status: str = "SUCCESS",
        *,
        actual_input_tokens: int | None = None,
        output_tokens: int | None = None,
        error: str | None = None,
        now_override: float | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._healthy()
            s = self.state
            now = float(now_override) if now_override is not None else time.time()

            entry = next((e for e in s["call_history"] if e["ticket_id"] == ticket_id), None)
            if not entry:
                raise ValueError(f"Unknown reservation ticket: {ticket_id}")

            in_flight = s.get("in_flight_tickets", {})
            in_flight.pop(ticket_id, None)
            s["current_in_flight"] = len(in_flight)

            if entry.get("status") == "RESERVED":
                entry["status"] = status
                entry["finished_time"] = now
                if actual_input_tokens is not None and actual_input_tokens >= 0:
                    entry["input_tokens"] = int(actual_input_tokens)
                if output_tokens is not None and output_tokens >= 0:
                    entry["output_tokens"] = int(output_tokens)
                if error:
                    entry["error"] = str(error)

            self._save_durable()
            return copy.deepcopy(entry)

    def record_denial(
        self,
        reason: str,
        client_service: str = "unknown",
        operation: str = "unknown",
    ) -> None:
        with self._lock:
            self._healthy()
            if "denied_history" not in self.state:
                self.state["denied_history"] = []
            self.state["denied_history"].append({
                "denial_index": len(self.state["denied_history"]) + 1,
                "timestamp": time.time(),
                "reason": reason,
                "client_service": client_service,
                "operation": operation,
            })
            self._save_durable()

    def get_summary(self) -> dict[str, Any]:
        with self._lock:
            self._healthy()
            now = time.time()
            s = self.state
            self._cleanup_stale_in_flight(now)

            window_start = now - 60.0
            recent_calls = [e for e in s["call_history"] if float(e.get("timestamp", 0)) >= window_start]

            model_summaries = {}
            for m_name, q in s.get("model_quotas", {}).items():
                m_recent = [e for e in recent_calls if e.get("model") == m_name]
                m_tokens = sum(int(e.get("input_tokens", 0)) for e in m_recent)
                headroom = float(q.get("headroom", 0.10))
                eff_rpm = max(1, int(math.floor(float(q["rpm"]) * (1.0 - headroom))))
                eff_tpm = max(1, int(math.floor(float(q["tpm"]) * (1.0 - headroom))))
                eff_rpd = max(1, int(math.floor(float(q["rpd"]) * (1.0 - headroom))))
                model_summaries[m_name] = {
                    "rpm_used": len(m_recent),
                    "rpm_effective_limit": eff_rpm,
                    "tpm_used": m_tokens,
                    "tpm_effective_limit": eff_tpm,
                    "rpd_effective_limit": eff_rpd,
                }

            return {
                "guard_profile": "P1_LIVE_FREE_TIER_01",
                "run_id": s.get("run_id"),
                "live_free_tier_enabled": s.get("live_free_tier_enabled"),
                "current_in_flight": s.get("current_in_flight", 0),
                "rpd_call_count": s.get("rpd_call_count", 0),
                "rpd_reset_timestamp": s.get("rpd_reset_timestamp"),
                "total_calls": len(s.get("call_history", [])),
                "denied_count": len(s.get("denied_history", [])),
                "model_summaries": model_summaries,
                "live_cost_usd": "0.00",
            }


def calculate_backoff_delay(
    attempt: int,
    max_retries: int = 3,
    retry_after: float | None = None,
) -> tuple[bool, float]:
    """Calculate bounded exponential backoff with jitter on 429."""
    if attempt >= max_retries:
        return False, 0.0

    if retry_after is not None and retry_after > 0:
        delay = min(60.0, max(0.5, float(retry_after)))
        return True, delay

    base = min(30.0, 1.0 * (2.0 ** attempt))
    jitter = random.uniform(0.8 * base, 1.2 * base)
    return True, round(jitter, 3)

