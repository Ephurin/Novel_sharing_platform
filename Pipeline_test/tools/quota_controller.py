"""P1-LIVE-FREE-02: Shared Quota Controller & Durable Ledger for Gemini Free Tier.

Enforces quota-aware admission for Google AI Studio Free Tier:
- Requests Per Minute (RPM) sliding window with configurable headroom
- Input Tokens Per Minute (TPM) pre-reservation and post-response reconciliation
- Requests Per Day (RPD) with Pacific Time daily reset (America/Los_Angeles, DST-aware)
- Explicit per-model quota configuration (no silent unverified production defaults)
- Operator attestation verification (project fingerprint, expiration, fail-closed)
- Bounded in-flight concurrency semaphore and durable stale recovery
- Atomic OS file locking across Python and Node workers
- Fail-closed durability with SHA-256 state envelope verification
"""
from __future__ import annotations

import copy
from datetime import datetime, time as datetime_time, timedelta
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
from zoneinfo import ZoneInfo


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

PACIFIC_TZ = ZoneInfo("America/Los_Angeles")


def get_next_pacific_midnight(now_ts: float) -> float:
    """Calculate the Unix timestamp of the next 00:00:00 in America/Los_Angeles (DST-aware)."""
    dt = datetime.fromtimestamp(now_ts, tz=PACIFIC_TZ)
    next_day_date = dt.date() + timedelta(days=1)
    next_midnight = datetime.combine(next_day_date, datetime_time.min, tzinfo=PACIFIC_TZ)
    return next_midnight.timestamp()


def create_operator_attestation(
    project_id: str,
    *,
    free_tier_confirmed: bool = True,
    duration_seconds: float = 86400.0,
    attested_by: str = "operator",
    now_override: float | None = None,
) -> dict[str, Any]:
    """Construct a documented operator attestation envelope."""
    now = float(now_override) if now_override is not None else time.time()
    raw_pid = str(project_id or "").strip()
    if not raw_pid:
        raise ValueError("project_id must not be empty")
    fp = hashlib.sha256(raw_pid.encode("utf-8")).hexdigest()[:12]
    return {
        "project_id_fingerprint": f"prj-sha256:{fp}",
        "free_tier_confirmed": bool(free_tier_confirmed),
        "verification_timestamp": now,
        "expires_at": now + float(duration_seconds),
        "attested_by": str(attested_by or "operator"),
    }


def parse_model_quotas_from_env() -> dict[str, dict[str, Any]]:
    """Parse operator-supplied quota limits from environment variables."""
    quotas: dict[str, dict[str, Any]] = {}

    def _safe_int(var_name: str) -> int:
        val = os.getenv(var_name, "").strip()
        try:
            return int(val)
        except (ValueError, TypeError):
            return 0

    def _safe_float(var_name: str, fallback_var: str | None = None, default: float = 0.10) -> float:
        val = os.getenv(var_name, "").strip()
        if not val and fallback_var:
            val = os.getenv(fallback_var, "").strip()
        try:
            return float(val) if val else default
        except (ValueError, TypeError):
            return default

    gemini_rpm = _safe_int("FREE_TIER_GEMINI_RPM")
    gemini_tpm = _safe_int("FREE_TIER_GEMINI_TPM")
    gemini_rpd = _safe_int("FREE_TIER_GEMINI_RPD")
    concurrency = _safe_int("FREE_TIER_MAX_CONCURRENCY") or 2
    headroom = _safe_float("FREE_TIER_QUOTA_HEADROOM", fallback_var="FREE_TIER_HEADROOM", default=0.10)

    if gemini_rpm > 0 and gemini_tpm > 0 and gemini_rpd > 0:
        llm_cfg = {
            "rpm": gemini_rpm,
            "tpm": gemini_tpm,
            "rpd": gemini_rpd,
            "max_concurrency": concurrency,
            "headroom": headroom,
        }
        quotas["gemini-3.5-flash-lite"] = copy.deepcopy(llm_cfg)
        # Prevent silently enabling fallback models: only add gemini-3.1-flash-lite if explicitly configured
        fallback_model = os.getenv("LLM_FALLBACK_MODEL", "").strip().lower()
        if fallback_model in {"gemini-3.1-flash-lite", "models/gemini-3.1-flash-lite"}:
            quotas["gemini-3.1-flash-lite"] = copy.deepcopy(llm_cfg)

    embed_rpm = _safe_int("FREE_TIER_EMBEDDING_RPM")
    embed_tpm = _safe_int("FREE_TIER_EMBEDDING_TPM")
    embed_rpd = _safe_int("FREE_TIER_EMBEDDING_RPD")
    if embed_rpm > 0 and embed_tpm > 0 and embed_rpd > 0:
        quotas["gemini-embedding-2"] = {
            "rpm": embed_rpm,
            "tpm": embed_tpm,
            "rpd": embed_rpd,
            "max_concurrency": concurrency,
            "headroom": headroom,
        }
    return quotas


class FreeTierQuotaLedger:
    """Shared, OS-locked, durable ledger tracking Free Tier RPM, TPM, RPD, and concurrency."""

    def __init__(
        self,
        state_file: str | Path,
        *,
        run_id: str | None = None,
        live_free_tier_enabled: bool = False,
        model_quotas: dict[str, dict[str, Any]] | None = None,
        operator_attestation: dict[str, Any] | None = None,
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

                # Require explicit per-model quota configuration
                if not model_quotas:
                    raise QuotaConfigRequiredError("QUOTA_CONFIG_REQUIRED: Explicit model_quotas mapping required")

                validated_quotas: dict[str, dict[str, Any]] = {}
                for m_raw, cfg in model_quotas.items():
                    m_name = m_raw.removeprefix("models/").strip()
                    if m_name not in ALL_APPROVED_MODELS:
                        raise ValueError(f"MODEL_NOT_APPROVED: {m_name}")
                    rpm = int(cfg.get("rpm", 0))
                    tpm = int(cfg.get("tpm", 0))
                    rpd = int(cfg.get("rpd", 0))
                    conc = int(cfg.get("max_concurrency", 0))
                    headroom = float(cfg.get("headroom", 0.10))
                    if rpm <= 0 or tpm <= 0 or rpd <= 0 or conc <= 0 or not (0.0 <= headroom < 1.0):
                        raise QuotaConfigRequiredError(f"QUOTA_CONFIG_REQUIRED: Invalid quota limits for {m_name}")
                    validated_quotas[m_name] = {
                        "rpm": rpm,
                        "tpm": tpm,
                        "rpd": rpd,
                        "max_concurrency": conc,
                        "headroom": headroom,
                    }

                now = time.time()
                next_midnight = get_next_pacific_midnight(now)

                # Validate operator attestation if live_free_tier_enabled is True
                if live_free_tier_enabled:
                    if not operator_attestation or not isinstance(operator_attestation, dict):
                        raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED: Operator attestation required")
                    if not operator_attestation.get("free_tier_confirmed"):
                        raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED: Free tier status not confirmed")
                    if float(operator_attestation.get("expires_at", 0)) <= now:
                        raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED: Operator attestation expired")
                    if not operator_attestation.get("project_id_fingerprint"):
                        raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED: Missing project fingerprint")

                self.state = {
                    "schema": 4,
                    "guard_profile": "P1_LIVE_FREE_TIER_01",
                    "run_id": run_id,
                    "live_free_tier_enabled": bool(live_free_tier_enabled),
                    "started": now,
                    "rpd_reset_timestamp": next_midnight,
                    "model_quotas": validated_quotas,
                    "operator_attestation": copy.deepcopy(operator_attestation) if operator_attestation else None,
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
        except (QuotaConfigRequiredError, FreeTierStatusUnverifiedError) as exc:
            self._init_error = exc
            self.close()
            if strict_fail_closed:
                raise exc
        except Exception as exc:
            self._init_error = QuotaMeterUnavailableError(str(exc))
            self.close()
            if strict_fail_closed:
                raise self._init_error

    def close(self) -> None:
        if self._owner:
            try:
                if os.name == "nt":
                    import msvcrt
                    try:
                        self._owner.seek(0)
                        msvcrt.locking(self._owner.fileno(), msvcrt.LK_UNLCK, 1)
                    except Exception:
                        pass
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
        """Mark stale in-flight tickets as TIMEOUT if they exceeded max duration and persist durably."""
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
            self._save_durable()
        return changed

    def set_live_free_tier_enabled(self, enabled: bool) -> None:
        """Atomically toggle live_free_tier_enabled with durable lock."""
        with self._lock:
            self._healthy()
            if enabled:
                attestation = self.state.get("operator_attestation")
                if not attestation or not attestation.get("free_tier_confirmed"):
                    raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED: Valid attestation required to enable")
                if float(attestation.get("expires_at", 0)) <= time.time():
                    raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED: Attestation has expired")
            self.state["live_free_tier_enabled"] = bool(enabled)
            self._save_durable()

    def update_operator_attestation(self, attestation: dict[str, Any]) -> None:
        """Durably update operator attestation state."""
        with self._lock:
            self._healthy()
            if not isinstance(attestation, dict) or not attestation.get("free_tier_confirmed"):
                raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED: Invalid attestation")
            if float(attestation.get("expires_at", 0)) <= time.time():
                raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED: Attestation has expired")
            if not attestation.get("project_id_fingerprint"):
                raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED: Missing project fingerprint")
            self.state["operator_attestation"] = copy.deepcopy(attestation)
            self._save_durable()

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

            # 1. Verification of operator enablement & attestation
            if not s.get("live_free_tier_enabled"):
                self.record_denial("FREE_TIER_STATUS_UNVERIFIED", client_service, operation)
                raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED")

            attestation = s.get("operator_attestation")
            if not attestation or not attestation.get("free_tier_confirmed"):
                self.record_denial("FREE_TIER_STATUS_UNVERIFIED", client_service, operation)
                raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED")

            if now > float(attestation.get("expires_at", 0)):
                self.record_denial("FREE_TIER_STATUS_UNVERIFIED", client_service, operation)
                raise FreeTierStatusUnverifiedError("FREE_TIER_STATUS_UNVERIFIED: Expired attestation")

            # 2. Model normalization and verification
            normalized_model = str(model or "").strip().removeprefix("models/")
            if normalized_model not in ALL_APPROVED_MODELS:
                self.record_denial("MODEL_NOT_APPROVED", client_service, operation)
                raise ValueError(f"MODEL_NOT_APPROVED: {normalized_model}")

            quotas = s.get("model_quotas", {}).get(normalized_model)
            if not quotas:
                self.record_denial("QUOTA_CONFIG_REQUIRED", client_service, operation)
                raise QuotaConfigRequiredError(f"Missing quota config for model {normalized_model}")

            # 3. Clean up stale in-flight reservations (durable write if changed)
            self._cleanup_stale_in_flight(now)

            # 4. Check and execute daily RPD reset (midnight Pacific Time)
            if now >= float(s.get("rpd_reset_timestamp", 0)):
                s["rpd_call_count"] = 0
                s["rpd_reset_timestamp"] = get_next_pacific_midnight(now)
                self._save_durable()

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
                "start_time": now,
            }
            s["in_flight_tickets"][ticket_id] = ticket
            s["current_in_flight"] = len(s["in_flight_tickets"])
            s["rpd_call_count"] += 1

            s["call_history"].append({
                "ticket_id": ticket_id,
                "call_index": ticket["call_index"],
                "timestamp": now,
                "model": normalized_model,
                "client_service": client_service,
                "operation": operation,
                "input_tokens": estimated_tokens,
                "status": "RESERVED",
            })

            self._save_durable()
            return copy.deepcopy(ticket)

    def finalize(
        self,
        ticket_id: str,
        status: str,
        *,
        actual_input_tokens: int | None = None,
        error: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._healthy()

            in_flight = self.state.get("in_flight_tickets", {})
            ticket = in_flight.pop(ticket_id, None)
            self.state["current_in_flight"] = len(in_flight)

            # Update call history entry
            entry: dict[str, Any] = {}
            for h in self.state.get("call_history", []):
                if h.get("ticket_id") == ticket_id:
                    entry = h
                    break

            if entry:
                entry["status"] = status
                entry["finished_time"] = time.time()
                if actual_input_tokens is not None and int(actual_input_tokens) >= 0:
                    entry["input_tokens"] = int(actual_input_tokens)
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
            if now >= float(s.get("rpd_reset_timestamp", 0)):
                s["rpd_call_count"] = 0
                s["rpd_reset_timestamp"] = get_next_pacific_midnight(now)
                self._save_durable()

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

            attestation_summary = None
            if s.get("operator_attestation"):
                att = s["operator_attestation"]
                attestation_summary = {
                    "project_id_fingerprint": att.get("project_id_fingerprint"),
                    "free_tier_confirmed": att.get("free_tier_confirmed"),
                    "expired": now > float(att.get("expires_at", 0)),
                    "expires_at": att.get("expires_at"),
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
                "operator_attestation": attestation_summary,
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
