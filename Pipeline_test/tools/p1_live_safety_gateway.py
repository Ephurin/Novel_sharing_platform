"""P1-LIVE-SAFETY-01: Dedicated live-acceptance safety budget gateway (offline fake-upstream mode).

Preserves `Pipeline_test/tools/budget_gateway.py` unchanged while enforcing the
strict P1 live-acceptance safety controls:
- Explicit enablement required (`enable_live_safety_guard=True` / `LIVE_SAFETY_GUARD_ENABLED=true`)
- Hard cap of 15 physical provider requests per run (`MAX_CALLS_REACHED`)
- Sliding-window rate limit of 10 admissions per rolling 60 seconds (`ROLLING_RATE_LIMIT_EXCEEDED`)
- Single approved model: `gemini-3.5-flash-lite` (`MODEL_NOT_APPROVED`)
- Shared durable OS-locked ledger across Python (`ai-service`) and Node (`backend`)
- No unmetered retry, repair, or model-discovery requests
- Defense-in-depth rejection of private author note fields (`PRIVATE_NOTES_FORBIDDEN_IN_PROMPT`)
- Bounded output tokens (`1..8192`) and request deadline enforcement
- Fake-upstream-only routing (`LIVE_UPSTREAM_NOT_AUTHORIZED` for any non-local upstream)
"""
from __future__ import annotations

import copy
from decimal import Decimal
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import threading
import time
from typing import Any
import urllib.error
from urllib.parse import urlparse
import http.client
import re
import socket
import urllib.request
import uuid

class RequestDeadlineExceeded(TimeoutError):
    """Raised when the end-to-end request exceeds the wall-clock deadline."""


class ResponseBoundExceeded(ValueError):
    """Raised when the response body exceeds the maximum permitted byte bound."""


def _extract_json_candidates(text: str) -> list[Any]:
    candidates: list[Any] = []
    trimmed = text.strip()
    if (trimmed.startswith("{") and trimmed.endswith("}")) or (trimmed.startswith("[") and trimmed.endswith("]")):
        try:
            parsed = json.loads(trimmed)
            candidates.append(parsed)
            while isinstance(parsed, str):
                p_trimmed = parsed.strip()
                if (p_trimmed.startswith("{") and p_trimmed.endswith("}")) or (p_trimmed.startswith("[") and p_trimmed.endswith("]")):
                    parsed = json.loads(p_trimmed)
                    candidates.append(parsed)
                else:
                    break
        except Exception:
            pass

    for m in re.finditer(r"```(?:json)?\s*([\{\[].*?[\}\]])\s*```", text, re.DOTALL):
        try:
            candidates.append(json.loads(m.group(1).strip()))
        except Exception:
            pass

    for m in re.finditer(r"(\{(?:[^{}]|(?:\{[^{}]*\}))*\}|\[(?:[^\[\]]|(?:\[[^\[\]]*\]))*\])", text, re.DOTALL):
        snippet = m.group(1).strip()
        if snippet != trimmed:
            try:
                parsed = json.loads(snippet)
                if isinstance(parsed, (dict, list)):
                    candidates.append(parsed)
            except Exception:
                pass
    return candidates


def _execute_bounded_request(
    request: urllib.request.Request,
    timeout_seconds: float,
    max_response_bytes: int = 2_000_000,
) -> tuple[int, dict[str, str], bytes]:
    start_mono = time.monotonic()
    deadline_mono = start_mono + timeout_seconds

    active_sock: list[socket.socket | None] = [None]
    timed_out = threading.Event()

    def watchdog_fire() -> None:
        timed_out.set()
        s = active_sock[0]
        if s is not None:
            try:
                s.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                s.close()
            except Exception:
                pass

    timer = threading.Timer(timeout_seconds, watchdog_fire)
    timer.daemon = True
    timer.start()

    class BoundedHTTPConnection(http.client.HTTPConnection):
        def connect(self) -> None:
            remaining = deadline_mono - time.monotonic()
            if remaining <= 0 or timed_out.is_set():
                raise RequestDeadlineExceeded(f"Deadline exceeded before connection ({timeout_seconds}s)")
            self.timeout = max(0.001, remaining)
            super().connect()
            active_sock[0] = self.sock
            if self.sock is not None:
                self.sock.settimeout(max(0.001, remaining))

    class BoundedHTTPHandler(urllib.request.HTTPHandler):
        def http_open(self, req: urllib.request.Request) -> http.client.HTTPResponse:
            return self.do_open(BoundedHTTPConnection, req)

    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        NoRedirect(),
        BoundedHTTPHandler(),
    )

    try:
        remaining = deadline_mono - time.monotonic()
        if remaining <= 0 or timed_out.is_set():
            raise RequestDeadlineExceeded(f"Deadline exceeded before request dispatch ({timeout_seconds}s)")

        try:
            response = opener.open(request, timeout=max(0.001, remaining))
        except urllib.error.HTTPError as http_err:
            fp = getattr(http_err, "fp", None)
            raw_sock = getattr(fp, "raw", None)
            if hasattr(raw_sock, "_sock"):
                active_sock[0] = raw_sock._sock

            chunks: list[bytes] = []
            total_read = 0
            while True:
                now = time.monotonic()
                if now >= deadline_mono or timed_out.is_set():
                    raise RequestDeadlineExceeded(f"Deadline exceeded while reading error response ({timeout_seconds}s)")
                rem = deadline_mono - now
                if active_sock[0] is not None:
                    try:
                        active_sock[0].settimeout(max(0.001, rem))
                    except Exception:
                        pass
                chunk = http_err.read(min(8192, max_response_bytes + 1 - total_read))
                if not chunk:
                    break
                chunks.append(chunk)
                total_read += len(chunk)
                if total_read > max_response_bytes:
                    raise ResponseBoundExceeded("Upstream response exceeds bound")
            return http_err.code, dict(http_err.headers), b"".join(chunks)

        fp = getattr(response, "fp", None)
        raw_sock = getattr(fp, "raw", None)
        if hasattr(raw_sock, "_sock"):
            active_sock[0] = raw_sock._sock

        chunks = []
        total_read = 0
        while True:
            now = time.monotonic()
            if now >= deadline_mono or timed_out.is_set():
                raise RequestDeadlineExceeded(f"Deadline exceeded while reading response body ({timeout_seconds}s)")
            rem = deadline_mono - now
            if active_sock[0] is not None:
                try:
                    active_sock[0].settimeout(max(0.001, rem))
                except Exception:
                    pass
            chunk = response.read(min(8192, max_response_bytes + 1 - total_read))
            if not chunk:
                break
            chunks.append(chunk)
            total_read += len(chunk)
            if total_read > max_response_bytes:
                raise ResponseBoundExceeded("Upstream response exceeds bound")

        status = response.status if hasattr(response, "status") else response.code
        headers = dict(response.headers)
        return status, headers, b"".join(chunks)

    except (socket.timeout, TimeoutError) as exc:
        raise RequestDeadlineExceeded(f"Request socket timed out under deadline: {exc}") from exc
    except OSError as exc:
        if timed_out.is_set():
            raise RequestDeadlineExceeded(f"Request aborted by deadline watchdog ({timeout_seconds}s)") from exc
        raise
    finally:
        timer.cancel()

try:
    from Pipeline_test.tools.budget_gateway import (
        BudgetExceededError,
        BudgetMeterUnavailableError,
        NoRedirect,
    )
except ImportError:
    from budget_gateway import (  # type: ignore[no-redef]
        BudgetExceededError,
        BudgetMeterUnavailableError,
        NoRedirect,
    )

APPROVED_MODEL = "gemini-3.5-flash-lite"
HARD_MAX_CALLS = 15
HARD_WINDOW_CALLS = 10
HARD_WINDOW_SECONDS = 60.0
HARD_MAX_COST_USD = Decimal("0.05")
HARD_MAX_WALL_CLOCK_SECONDS = 7200

FORBIDDEN_PRIVATE_NOTE_KEYS = frozenset({
    "author_notes",
    "private_author_notes",
    "authorNotes",
    "privateAuthorNotes",
    "private_notes",
    "privateNotes",
})


def _payload_contains_private_notes(value: Any, *, in_entity_list: bool = False) -> bool:
    if isinstance(value, dict):
        is_entity = in_entity_list or any(
            k in value for k in ("entity_id", "characterId", "character_id", "canonical_name", "role")
        ) or ("name" in value and any(k in value for k in ("notes", "description", "personality")))
        for k, v in value.items():
            if k in FORBIDDEN_PRIVATE_NOTE_KEYS:
                return True
            if is_entity and k == "notes" and v not in (None, ""):
                return True
            if _payload_contains_private_notes(
                v,
                in_entity_list=(in_entity_list or k in {"entities", "characters", "known_entities"}),
            ):
                return True
        return False
    if isinstance(value, list):
        return any(_payload_contains_private_notes(item, in_entity_list=in_entity_list) for item in value)
    if isinstance(value, str):
        # 1. Inspect any JSON-serialized structures inside string
        for candidate in _extract_json_candidates(value):
            if _payload_contains_private_notes(candidate, in_entity_list=in_entity_list):
                return True

        # 2. String-level key detection for private author notes (quoted/escaped keys)
        lowered = value.lower()
        if any(
            token in lowered
            for token in (
                '"author_notes"',
                '"private_author_notes"',
                '"authornotes"',
                '"privateauthornotes"',
                '"private_notes"',
                '"privatenotes"',
                '\"author_notes\"',
                '\"private_author_notes\"',
                '\"authornotes\"',
                '\"privateauthornotes\"',
                '\"private_notes\"',
                '\"privatenotes\"',
            )
        ):
            return True

        # 3. String-level detection of serialized entity notes like {"name": "...", "notes": "..."}
        # Avoid blocking prose that merely mentions "notes".
        notes_pattern = re.compile(r"""(?:\\?"|['"])notes(?:\\?"|['"])\s*:\s*(?:\\?"|['"])(?!null)(?!\s*(?:\\?"|['"]))[^"'\\]+""", re.IGNORECASE)
        entity_pattern = re.compile(r"""(?:\\?"|['"])(?:characters?|entities|known_entities|character_id|characterId|entity_id|canonical_name|protagonist|role)(?:\\?"|['"])""", re.IGNORECASE)
        if notes_pattern.search(value) and entity_pattern.search(value):
            return True
    return False


class LiveSafetyBudgetLedger:
    def __init__(
        self,
        state_file: str | Path,
        max_calls: int = HARD_MAX_CALLS,
        max_window_calls: int = HARD_WINDOW_CALLS,
        window_seconds: float = HARD_WINDOW_SECONDS,
        max_cost_usd: float | Decimal = Decimal("0.05"),
        admission_cost_usd: float | Decimal = Decimal("0.05"),
        max_wall_clock_seconds: float = 1800,
        strict_fail_closed: bool = True,
        *,
        enable_live_safety_guard: bool = False,
        initialize: bool = False,
        run_id: str | None = None,
    ) -> None:
        self.state_file = Path(state_file)
        self._lock = threading.RLock()
        self._init_error: BudgetMeterUnavailableError | None = None
        self._owner = None
        self._initializing = False
        self.state: dict[str, Any] = {}
        try:
            if not strict_fail_closed:
                raise BudgetMeterUnavailableError("Fail-open mode is forbidden")
            if not enable_live_safety_guard:
                raise BudgetMeterUnavailableError("LIVE_SAFETY_GUARD_NOT_ENABLED")
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
                    raise BudgetMeterUnavailableError("MISSING_AUTHORITATIVE_LEDGER")
                if not run_id:
                    raise BudgetMeterUnavailableError("Explicit run_id required")
                for value in (
                    float(max_calls),
                    float(max_window_calls),
                    float(window_seconds),
                    float(max_cost_usd),
                    float(admission_cost_usd),
                    float(max_wall_clock_seconds),
                ):
                    if not math.isfinite(value) or value <= 0:
                        raise ValueError("Invalid budget ceiling")
                if (
                    type(max_calls) is not int
                    or max_calls > HARD_MAX_CALLS
                    or type(max_window_calls) is not int
                    or max_window_calls > HARD_WINDOW_CALLS
                    or float(window_seconds) < HARD_WINDOW_SECONDS
                    or Decimal(str(max_cost_usd)) > HARD_MAX_COST_USD
                    or Decimal(str(admission_cost_usd)) > Decimal(str(max_cost_usd))
                    or max_wall_clock_seconds > HARD_MAX_WALL_CLOCK_SECONDS
                ):
                    raise ValueError("Requested budget exceeds P1-LIVE-SAFETY-01 ceilings")
                started = time.time()
                self.state = dict(
                    schema=3,
                    guard_profile="P1_LIVE_SAFETY_01",
                    run_id=run_id,
                    approved_model=APPROVED_MODEL,
                    max_calls=max_calls,
                    max_window_calls=max_window_calls,
                    window_seconds=float(window_seconds),
                    max_cost_usd=str(Decimal(str(max_cost_usd))),
                    admission_cost_usd=str(Decimal(str(admission_cost_usd))),
                    deadline=started + float(max_wall_clock_seconds),
                    started=started,
                    total_calls=0,
                    charged_usd="0",
                    outstanding_usd="0",
                    call_history=[],
                    status="FAKE_UPSTREAM_ONLY",
                    live_forwarding_enabled=False,
                    actual_invoice_usd="0.00",
                )
                self._initializing = True
                try:
                    with marker.open("x", encoding="utf-8") as stream:
                        json.dump({"run_id": run_id, "guard_profile": "P1_LIVE_SAFETY_01"}, stream)
                        stream.flush()
                        os.fsync(stream.fileno())
                    self._save_durable()
                finally:
                    self._initializing = False
            else:
                self.state = self._read_verified()
                if not marker.is_file() or json.loads(marker.read_text(encoding="utf-8")).get("run_id") != self.state["run_id"]:
                    raise BudgetMeterUnavailableError("LEDGER_MARKER_MISMATCH")
        except Exception as exc:
            self._init_error = BudgetMeterUnavailableError(str(exc))

    def close(self) -> None:
        if self._owner:
            self._owner.close()
            self._owner = None

    def _read_verified(self) -> dict[str, Any]:
        if not self.state_file.is_file():
            raise BudgetMeterUnavailableError("MISSING_AUTHORITATIVE_LEDGER")
        marker = Path(str(self.state_file) + ".initialized")
        if not marker.is_file():
            raise BudgetMeterUnavailableError("MISSING_LEDGER_MARKER")
        try:
            envelope = json.loads(self.state_file.read_text(encoding="utf-8"))
        except Exception as exc:
            raise BudgetMeterUnavailableError(f"CORRUPT_LEDGER_JSON: {exc}") from exc
        if not isinstance(envelope, dict) or "state" not in envelope:
            raise BudgetMeterUnavailableError("INVALID_LEDGER_ENVELOPE")
        data = envelope["state"]
        encoded = json.dumps(data, sort_keys=True, separators=(",", ":")).encode()
        if envelope.get("sha256") != hashlib.sha256(encoded).hexdigest() or data.get("schema") != 3:
            raise BudgetMeterUnavailableError("CORRUPT_OR_LEGACY_LEDGER")
        try:
            marker_data = json.loads(marker.read_text(encoding="utf-8"))
            if marker_data.get("run_id") != data.get("run_id"):
                raise BudgetMeterUnavailableError("LEDGER_MARKER_MISMATCH")
        except Exception as exc:
            if isinstance(exc, BudgetMeterUnavailableError):
                raise
            raise BudgetMeterUnavailableError(f"INVALID_LEDGER_MARKER: {exc}") from exc
        if data.get("guard_profile") != "P1_LIVE_SAFETY_01" or data.get("approved_model") != APPROVED_MODEL:
            raise BudgetMeterUnavailableError("INVALID_GUARD_PROFILE")
        if data.get("live_forwarding_enabled") is not False:
            raise BudgetMeterUnavailableError("LIVE_FORWARDING_FORBIDDEN")
        if (
            data["total_calls"] != len(data["call_history"])
            or not 0 <= data["total_calls"] <= data["max_calls"]
            or not math.isfinite(data["deadline"])
            or data["deadline"] - data["started"] > HARD_MAX_WALL_CLOCK_SECONDS
        ):
            raise BudgetMeterUnavailableError("INVALID_LEDGER_COUNTERS")
        if (
            type(data["max_calls"]) is not int
            or data["max_calls"] > HARD_MAX_CALLS
            or type(data["max_window_calls"]) is not int
            or data["max_window_calls"] > HARD_WINDOW_CALLS
            or float(data["window_seconds"]) < HARD_WINDOW_SECONDS
            or not Decimal("0") < Decimal(data["admission_cost_usd"]) <= Decimal(data["max_cost_usd"]) <= HARD_MAX_COST_USD
        ):
            raise BudgetMeterUnavailableError("INVALID_PERSISTED_CEILINGS")
        entries = data["call_history"]
        if len({e["ticket_id"] for e in entries}) != len(entries):
            raise BudgetMeterUnavailableError("DUPLICATE_LEDGER_TICKET")
        outstanding = sum((Decimal(e["liability_usd"]) for e in entries if e["status"] == "RESERVED"), Decimal(0))
        charged = sum((Decimal(e["charged_usd"]) for e in entries if e["status"] != "RESERVED"), Decimal(0))
        if outstanding != Decimal(data["outstanding_usd"]) or charged != Decimal(data["charged_usd"]):
            raise BudgetMeterUnavailableError("INVALID_LEDGER_LIABILITY")
        if min(charged, outstanding) < 0:
            raise BudgetMeterUnavailableError("NEGATIVE_LEDGER_LIABILITY")
        return data

    def _healthy(self) -> None:
        with self._lock:
            if self._init_error:
                raise self._init_error
            if not self.state_file.is_file():
                self._init_error = BudgetMeterUnavailableError("MISSING_AUTHORITATIVE_LEDGER")
                raise self._init_error
            try:
                if self._read_verified() != self.state:
                    raise BudgetMeterUnavailableError("AUTHORITATIVE_LEDGER_CHANGED")
            except Exception as exc:
                self._init_error = BudgetMeterUnavailableError(str(exc))
                raise self._init_error

    def _save_durable(self) -> None:
        if self._init_error:
            raise self._init_error
        if not getattr(self, "_initializing", False) and not self.state_file.is_file():
            self._init_error = BudgetMeterUnavailableError("MISSING_AUTHORITATIVE_LEDGER")
            raise self._init_error
        temporary = self.state_file.with_name(self.state_file.name + ".tmp-" + uuid.uuid4().hex)
        try:
            data = json.dumps(self.state, sort_keys=True, separators=(",", ":")).encode()
            with temporary.open("xb") as stream:
                stream.write(
                    json.dumps({"state": self.state, "sha256": hashlib.sha256(data).hexdigest()}).encode()
                )
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
                directory = os.open(self.state_file.parent, os.O_RDONLY)
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
        except Exception as exc:
            self._init_error = BudgetMeterUnavailableError("LEDGER_DURABILITY_FAILURE")
            raise self._init_error from exc
        finally:
            if temporary.exists():
                temporary.unlink()

    def reserve(
        self,
        operation: str = "generic",
        estimated_cost: Any = None,
        provider: str = "gemini",
        model: str = APPROVED_MODEL,
        client_service: str = "unknown",
        *,
        liability_usd: str | Decimal | float | None = None,
        now_override: float | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._healthy()
            normalized_model = str(model or "").strip().removeprefix("models/")
            if normalized_model != APPROVED_MODEL:
                raise BudgetExceededError("MODEL_NOT_APPROVED")
            if liability_usd is None:
                raise BudgetExceededError("CONSERVATIVE_LIABILITY_REQUIRED")
            amount = Decimal(str(liability_usd))
            if not amount.is_finite() or amount <= 0:
                raise BudgetExceededError("INVALID_LIABILITY")

            s = self.state
            now = float(now_override) if now_override is not None else time.time()
            if now >= s["deadline"]:
                self.record_denial("ABSOLUTE_DEADLINE_EXPIRED", client_service=client_service, operation=operation)
                raise BudgetExceededError("ABSOLUTE_DEADLINE_EXPIRED")
            if s["total_calls"] >= s["max_calls"]:
                self.record_denial("MAX_CALLS_REACHED", client_service=client_service, operation=operation)
                raise BudgetExceededError("MAX_CALLS_REACHED")

            # Sliding-window rate limit check across all physical requests in the last window_seconds.
            window_secs = float(s["window_seconds"])
            max_window = int(s["max_window_calls"])
            for entry in s["call_history"]:
                ts = float(entry["timestamp"])
                if now < ts - 0.001:
                    self._init_error = BudgetMeterUnavailableError("CLOCK_ROLLBACK_DETECTED")
                    raise self._init_error
            recent_calls = [
                entry for entry in s["call_history"] if (now - float(entry["timestamp"])) < window_secs
            ]
            if len(recent_calls) >= max_window:
                self.record_denial("ROLLING_RATE_LIMIT_EXCEEDED", client_service=client_service, operation=operation)
                raise BudgetExceededError("ROLLING_RATE_LIMIT_EXCEEDED")

            committed = Decimal(s["charged_usd"]) + Decimal(s["outstanding_usd"]) + amount
            if committed > min(Decimal(s["admission_cost_usd"]), Decimal(s["max_cost_usd"])):
                self.record_denial("OUTSTANDING_LIABILITY_COST_LIMIT", client_service=client_service, operation=operation)
                raise BudgetExceededError("OUTSTANDING_LIABILITY_COST_LIMIT")

            ticket = dict(
                ticket_id=str(uuid.uuid4()),
                call_index=s["total_calls"] + 1,
                client_service=client_service,
                operation=operation,
                provider=provider,
                model=normalized_model,
                liability_usd=str(amount),
                charged_usd="0",
                status="RESERVED",
                timestamp=now,
            )
            prev_total = s["total_calls"]
            prev_history = list(s["call_history"])
            prev_outstanding = s["outstanding_usd"]

            s["total_calls"] += 1
            s["call_history"].append(ticket)
            s["outstanding_usd"] = str(Decimal(s["outstanding_usd"]) + amount)
            try:
                self._save_durable()
            except Exception:
                s["total_calls"] = prev_total
                s["call_history"] = prev_history
                s["outstanding_usd"] = prev_outstanding
                raise
            return copy.deepcopy(ticket)

    def record_denial(self, reason: str, client_service: str = "unknown", operation: str = "unknown") -> None:
        with self._lock:
            self._healthy()
            if "denied_history" not in self.state:
                self.state["denied_history"] = []
            denial_entry = {
                "denial_index": len(self.state["denied_history"]) + 1,
                "timestamp": time.time(),
                "reason": reason,
                "client_service": client_service,
                "operation": operation,
            }
            self.state["denied_history"].append(denial_entry)
            try:
                self._save_durable()
            except Exception:
                self.state["denied_history"].pop()
                raise

    def finalize(
        self,
        ticket_id: str,
        status: str = "SUCCESS",
        *,
        cost_usd: str | Decimal | float | None = None,
        **usage: Any,
    ) -> dict[str, Any]:
        with self._lock:
            self._healthy()
            entry = next((e for e in self.state["call_history"] if e["ticket_id"] == ticket_id), None)
            if not entry:
                raise ValueError("Unknown reservation")
            if entry["status"] != "RESERVED":
                return copy.deepcopy(entry)
            liability = Decimal(entry["liability_usd"])
            amount = liability if cost_usd is None else Decimal(str(cost_usd))
            if not amount.is_finite() or not 0 <= amount <= liability:
                raise BudgetMeterUnavailableError("UNVERIFIED_USAGE_EXCEEDS_LIABILITY")
            entry.update(status=status, charged_usd=str(amount), finished=time.time())
            self.state["outstanding_usd"] = str(Decimal(self.state["outstanding_usd"]) - liability)
            self.state["charged_usd"] = str(Decimal(self.state["charged_usd"]) + amount)
            self._save_durable()
            return copy.deepcopy(entry)

    def get_summary(self) -> dict[str, Any]:
        with self._lock:
            self._healthy()
            now = time.time()
            window_secs = float(self.state["window_seconds"])
            rolling_window_calls = sum(
                1 for e in self.state["call_history"] if (now - float(e["timestamp"])) < window_secs
            )
            return {
                **copy.deepcopy(self.state),
                "rolling_window_calls": rolling_window_calls,
                "remaining_calls": max(0, self.state["max_calls"] - self.state["total_calls"]),
                "denied_requests_count": len(self.state.get("denied_history", [])),
                "denied_history": copy.deepcopy(self.state.get("denied_history", [])),
                "live_authorized": False,
                "live_cost_hard_cap": "BUDGET_COST_HARD_CAP_UNPROVEN",
                "pricing_scope": "GEMINI_3_5_FLASH_LITE_PAID_STANDARD_CONSERVATIVE_CEILING",
                "actual_invoice_usd": "0.00",
            }


class LiveSafetyGatewayHandler(BaseHTTPRequestHandler):
    ledger: LiveSafetyBudgetLedger | None = None
    upstream_base_url: str | None = None
    upstream_api_key: str | None = None
    client_tokens: dict[str, str] | None = None
    upstream_timeout: float = 3.0
    max_output_tokens: int = 8192
    max_body_bytes: int = 65536
    enable_live_safety_guard: bool = False
    live_forwarding_enabled: bool = False
    # Official gemini-3.5-flash-lite Paid Standard tariffs ($0.30/1M input, $2.50/1M output)
    input_rate = Decimal("0.30") / Decimal("1000000")
    output_rate = Decimal("2.50") / Decimal("1000000")

    def _send_json(self, status: int, data: dict[str, Any]) -> None:
        body = json.dumps(data).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _verify_fake_upstream_only(self) -> bool:
        if not self.enable_live_safety_guard:
            self._send_json(503, {"error": "LIVE_SAFETY_GUARD_NOT_ENABLED"})
            return False
        if self.live_forwarding_enabled:
            self._send_json(503, {"error": "LIVE_UPSTREAM_NOT_AUTHORIZED"})
            return False
        parsed = urlparse(self.upstream_base_url or "")
        if (
            parsed.scheme != "http"
            or parsed.hostname not in {"127.0.0.1", "localhost", "fake-upstream"}
            or parsed.username
            or parsed.query
        ):
            self._send_json(
                503,
                {
                    "error": "LIVE_UPSTREAM_NOT_AUTHORIZED",
                    "live_cost_hard_cap": "BUDGET_COST_HARD_CAP_UNPROVEN",
                },
            )
            return False
        return True

    def do_GET(self) -> None:
        if self.path in ("/health", "/status", "/api/budget/status"):
            if not self.enable_live_safety_guard or self.ledger is None:
                return self._send_json(503, {"error": "LIVE_SAFETY_GUARD_NOT_ENABLED"})
            try:
                self._send_json(200, self.ledger.get_summary())
            except BudgetMeterUnavailableError as exc:
                self._send_json(503, {"error": "BUDGET_METER_UNAVAILABLE", "detail": str(exc)})
        elif self.path == "/v1/models":
            if "X-Budget-Ticket" in self.headers:
                return self._send_json(403, {"error": "CLIENT_TICKETS_FORBIDDEN"})
            token = self.headers.get("Authorization", "").removeprefix("Bearer ")
            if token not in (self.client_tokens or {}):
                return self._send_json(401, {"error": "WORKER_AUTH_REQUIRED"})
            if not self._verify_fake_upstream_only():
                return
            if self.ledger is None:
                return self._send_json(503, {"error": "BUDGET_METER_UNAVAILABLE", "detail": "LEDGER_NOT_ATTACHED"})
            self.ledger._healthy()
            try:
                ticket = self.ledger.reserve(
                    operation="models_discovery",
                    provider="fake-metadata",
                    model=APPROVED_MODEL,
                    client_service=self.client_tokens[token],
                    liability_usd="0.000001",
                )
                request = urllib.request.Request(
                    (self.upstream_base_url or "").rstrip("/") + "/v1/models",
                    headers={
                        "Authorization": "Bearer " + (self.upstream_api_key or ""),
                        "X-Gateway-Dispatch-Id": ticket["ticket_id"],
                        "X-Gateway-Client": self.client_tokens[token],
                    },
                )
                try:
                    status, headers, body_bytes = _execute_bounded_request(
                        request,
                        timeout_seconds=self.upstream_timeout,
                        max_response_bytes=65536,
                    )
                    if status == 200:
                        result = json.loads(body_bytes.decode("utf-8"))
                        self.ledger.finalize(ticket["ticket_id"], "SUCCESS")
                        self._send_json(200, result)
                    else:
                        self.ledger.finalize(ticket["ticket_id"], "FAILED")
                        self._send_json(status, {"error": "MODEL_DISCOVERY_UNAVAILABLE"})
                except RequestDeadlineExceeded:
                    self.ledger.finalize(ticket["ticket_id"], "UNKNOWN")
                    self._send_json(503, {"error": "MODEL_DISCOVERY_UNAVAILABLE", "detail": "REQUEST_DEADLINE_EXCEEDED"})
                except Exception:
                    self.ledger.finalize(ticket["ticket_id"], "UNKNOWN")
                    self._send_json(503, {"error": "MODEL_DISCOVERY_UNAVAILABLE"})
            except BudgetExceededError as exc:
                self._send_json(429, {"error": str(exc)})
            except BudgetMeterUnavailableError as exc:
                self._send_json(503, {"error": "BUDGET_METER_UNAVAILABLE", "detail": str(exc)})
            except Exception:
                self._send_json(503, {"error": "MODEL_DISCOVERY_UNAVAILABLE"})
        else:
            self._send_json(404, {"error": "UNSUPPORTED_UNGUARDED_ROUTE"})

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > self.max_body_bytes or self.headers.get("Transfer-Encoding"):
                return self._send_json(413, {"error": "BOUNDED_CONTENT_LENGTH_REQUIRED"})
            previous_timeout = self.connection.gettimeout()
            try:
                self.connection.settimeout(3)
                raw_body = self.rfile.read(length)
            except (TimeoutError, OSError):
                return self._send_json(408, {"error": "REQUEST_BODY_UNAVAILABLE"})
            finally:
                self.connection.settimeout(previous_timeout)
            if len(raw_body) != length:
                return self._send_json(400, {"error": "TRUNCATED_REQUEST_BODY"})
            if "X-Budget-Ticket" in self.headers:
                return self._send_json(403, {"error": "CLIENT_TICKETS_FORBIDDEN"})
            if self.path.startswith("/api/budget/"):
                return self._send_json(403, {"error": "GATEWAY_OWNS_RESERVATION_AND_SETTLEMENT"})
            token = (
                self.headers.get("Authorization", "").removeprefix("Bearer ")
                or self.headers.get("x-goog-api-key", "")
            )
            client = (self.client_tokens or {}).get(token)
            if not client:
                return self._send_json(401, {"error": "WORKER_AUTH_REQUIRED"})
            if not self._verify_fake_upstream_only():
                return
            if self.ledger is None:
                return self._send_json(503, {"error": "BUDGET_METER_UNAVAILABLE", "detail": "LEDGER_NOT_ATTACHED"})
            self.ledger._healthy()

            body = json.loads(raw_body)
            native = self.path.startswith("/v1beta/models/") and self.path.endswith(":generateContent")
            compat = self.path == "/v1/chat/completions"
            if not (native or compat):
                return self._send_json(403, {"error": "UNSUPPORTED_BILLABLE_ROUTE"})

            model = self.path.split("/models/", 1)[1].split(":")[0] if native else body.get("model")
            normalized_model = str(model or "").strip().removeprefix("models/")
            if normalized_model != APPROVED_MODEL:
                if self.ledger:
                    self.ledger.record_denial("MODEL_NOT_APPROVED", client_service=client, operation=self.path)
                return self._send_json(403, {"error": "MODEL_NOT_APPROVED", "requested_model": str(model)})

            if _payload_contains_private_notes(body):
                if self.ledger:
                    self.ledger.record_denial("PRIVATE_NOTES_FORBIDDEN_IN_PROMPT", client_service=client, operation=self.path)
                return self._send_json(403, {"error": "PRIVATE_NOTES_FORBIDDEN_IN_PROMPT"})

            config = body.get("generationConfig", {}) if native else body
            limit = config.get("maxOutputTokens") if native else config.get("max_tokens")
            if type(limit) is not int or not 1 <= limit <= self.max_output_tokens or body.get("stream"):
                return self._send_json(422, {"error": "BOUNDED_TEXT_OUTPUT_REQUIRED"})
            variants = config.get("candidateCount", 1) if native else body.get("n", 1)
            if type(variants) is not int or variants != 1 or "best_of" in body:
                return self._send_json(403, {"error": "UNPRICED_MULTIPLE_OUTPUTS"})
            if config.get("responseModalities", ["TEXT"]) != ["TEXT"]:
                return self._send_json(403, {"error": "UNPRICED_OUTPUT_MODALITY"})

            forbidden = (
                "inlineData",
                "fileData",
                "image_url",
                "audio",
                "video",
                "tools",
                "cachedContent",
                "thinkingConfig",
                "max_completion_tokens",
            )

            def has_forbidden(value: Any) -> bool:
                if isinstance(value, dict):
                    return any(k in forbidden or has_forbidden(v) for k, v in value.items())
                if isinstance(value, list):
                    return any(has_forbidden(v) for v in value)
                return False

            if has_forbidden(body):
                return self._send_json(403, {"error": "UNPRICED_BILLABLE_VARIANT"})

            wire = json.dumps(body, ensure_ascii=False).encode("utf-8")
            liability = (len(wire) + 4096) * self.input_rate + limit * self.output_rate
            ticket = self.ledger.reserve(
                operation="gemini_generate_content" if native else "chat_completions",
                provider="gemini-native" if native else "gemini-openai-compatible",
                model=normalized_model,
                client_service=client,
                liability_usd=liability,
            )
            url = (self.upstream_base_url or "").rstrip("/") + self.path
            headers = {
                "Content-Type": "application/json",
                "X-Gateway-Dispatch-Id": ticket["ticket_id"],
                "X-Gateway-Client": client,
            }
            if self.upstream_api_key:
                headers["x-goog-api-key" if native else "Authorization"] = (
                    "" if native else "Bearer "
                ) + self.upstream_api_key
            request = urllib.request.Request(url, data=wire, headers=headers, method="POST")
            try:
                status, headers, body_bytes = _execute_bounded_request(
                    request,
                    timeout_seconds=self.upstream_timeout,
                    max_response_bytes=2_000_000,
                )
                if status == 200:
                    result = json.loads(body_bytes.decode("utf-8"))
                    self.ledger.finalize(ticket["ticket_id"], "SUCCESS")
                    return self._send_json(200, result)
                else:
                    self.ledger.finalize(ticket["ticket_id"], "FAILED")
                    return self._send_json(status, {"error": "UPSTREAM_HTTP_ERROR", "upstream_status": status})
            except RequestDeadlineExceeded:
                self.ledger.finalize(ticket["ticket_id"], "UNKNOWN")
                return self._send_json(502, {"error": "UPSTREAM_ERROR_OR_TIMEOUT", "detail": "REQUEST_DEADLINE_EXCEEDED"})
            except ResponseBoundExceeded:
                self.ledger.finalize(ticket["ticket_id"], "UNKNOWN")
                return self._send_json(502, {"error": "UPSTREAM_ERROR_OR_TIMEOUT", "detail": "RESPONSE_BOUND_EXCEEDED"})
            except BudgetMeterUnavailableError as exc:
                self.ledger.finalize(ticket["ticket_id"], "UNKNOWN")
                return self._send_json(503, {"error": "BUDGET_METER_UNAVAILABLE", "detail": str(exc)})
            except Exception as exc:
                self.ledger.finalize(ticket["ticket_id"], "UNKNOWN")
                return self._send_json(502, {"error": "UPSTREAM_ERROR_OR_TIMEOUT", "detail": str(exc)})
        except BudgetExceededError as exc:
            self._send_json(429, {"error": str(exc)})
        except BudgetMeterUnavailableError as exc:
            self._send_json(503, {"error": "BUDGET_METER_UNAVAILABLE", "detail": str(exc)})
        except (ValueError, TypeError, KeyError):
            self._send_json(422, {"error": "INVALID_REQUEST"})

    def log_message(self, *args: Any) -> None:
        pass


def start_live_safety_gateway(
    state_file: str | Path,
    host: str = "127.0.0.1",
    port: int = 18090,
    max_calls: int = HARD_MAX_CALLS,
    max_window_calls: int = HARD_WINDOW_CALLS,
    window_seconds: float = HARD_WINDOW_SECONDS,
    max_cost_usd: float | Decimal = Decimal("0.05"),
    admission_cost_usd: float | Decimal = Decimal("0.05"),
    max_wall_clock_seconds: float = 1800,
    upstream_base_url: str | None = None,
    upstream_api_key: str | None = None,
    *,
    enable_live_safety_guard: bool = False,
    initialize: bool = False,
    run_id: str | None = None,
    client_tokens: dict[str, str] | None = None,
    upstream_timeout: float = 3.0,
) -> tuple[ThreadingHTTPServer, threading.Thread, LiveSafetyBudgetLedger]:
    ledger = LiveSafetyBudgetLedger(
        state_file,
        max_calls=max_calls,
        max_window_calls=max_window_calls,
        window_seconds=window_seconds,
        max_cost_usd=max_cost_usd,
        admission_cost_usd=admission_cost_usd,
        max_wall_clock_seconds=max_wall_clock_seconds,
        enable_live_safety_guard=enable_live_safety_guard,
        initialize=initialize,
        run_id=run_id,
    )

    class Handler(LiveSafetyGatewayHandler):
        pass

    Handler.ledger = ledger
    Handler.upstream_base_url = upstream_base_url
    Handler.upstream_api_key = upstream_api_key
    Handler.client_tokens = client_tokens or {}
    Handler.upstream_timeout = upstream_timeout
    Handler.enable_live_safety_guard = enable_live_safety_guard
    Handler.live_forwarding_enabled = False
    server = ThreadingHTTPServer((host, port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server, thread, ledger


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="P1-LIVE-SAFETY-01 Budget Gateway")
    parser.add_argument("--state", required=True)
    parser.add_argument("--initialize", action="store_true")
    parser.add_argument("--enable-live-safety-guard", action="store_true")
    parser.add_argument("--run-id")
    parser.add_argument("--port", type=int, default=18090)
    parser.add_argument("--max-calls", type=int, default=HARD_MAX_CALLS)
    parser.add_argument("--max-window-calls", type=int, default=HARD_WINDOW_CALLS)
    parser.add_argument("--window-seconds", type=float, default=HARD_WINDOW_SECONDS)
    args = parser.parse_args()

    guard_enabled = args.enable_live_safety_guard or (
        os.getenv("LIVE_SAFETY_GUARD_ENABLED", "").strip().lower() == "true"
    )
    if args.initialize:
        ledger = LiveSafetyBudgetLedger(
            args.state,
            max_calls=args.max_calls,
            max_window_calls=args.max_window_calls,
            window_seconds=args.window_seconds,
            enable_live_safety_guard=guard_enabled,
            initialize=True,
            run_id=args.run_id,
        )
        ledger.get_summary()
        ledger.close()
    else:
        server, thread, ledger = start_live_safety_gateway(
            args.state,
            host="0.0.0.0",
            port=args.port,
            max_calls=args.max_calls,
            max_window_calls=args.max_window_calls,
            window_seconds=args.window_seconds,
            upstream_base_url=os.environ["OFFLINE_UPSTREAM_URL"],
            upstream_api_key=os.environ.get("OFFLINE_UPSTREAM_KEY"),
            enable_live_safety_guard=guard_enabled,
            client_tokens=json.loads(os.environ["WORKER_AUTH_TOKENS"]),
            upstream_timeout=float(os.getenv("GATEWAY_UPSTREAM_TIMEOUT_SECONDS", "3")),
        )
        thread.join()
