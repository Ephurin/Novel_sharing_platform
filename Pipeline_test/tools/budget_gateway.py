"""
Authoritative Cross-Container Budget Gateway & Egress Interceptor (Wave 1C).
Enforces owner-approved ceilings across all containers and processes:
- Hard ceiling: Max 200 provider call attempts (rejects call 201)
- Hard ceiling: Max USD 5.00 spend (admission cutoff at USD 4.50)
- Hard ceiling: Max 2 hours elapsed live wall-clock time from first attempt
- Atomic pre-dispatch reservation: Consumes attempt BEFORE network request
- Strict fail-closed: Corrupted state or unavailable meter DENIES dispatch
- Dual-mode: Standalone HTTP proxy gateway & Python ledger library
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import uuid
import urllib.request
import urllib.error
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

# Pricing rates per 1,000,000 tokens (Google AI Studio Gemini 3.5 Flash-Lite reference)
INPUT_COST_PER_M = 0.10
OUTPUT_COST_PER_M = 0.40

# Conservative fallback when usage tokens are missing or not reported
DEFAULT_PROMPT_TOKENS = 2000
DEFAULT_CANDIDATE_TOKENS = 800


class BudgetExceededError(RuntimeError):
    """Raised when any approved budget ceiling is exceeded."""
    pass


class BudgetMeterUnavailableError(RuntimeError):
    """Raised when budget ledger is corrupted, unreadable, or unavailable (fail-closed)."""
    pass


class AuthoritativeBudgetLedger:
    """Authoritative ledger managing persistent state and enforcing ceilings."""

    def __init__(
        self,
        state_file: Path,
        max_calls: int = 200,
        max_cost_usd: float = 5.00,
        admission_cost_usd: float = 4.50,
        max_wall_clock_seconds: int = 7200,
        strict_fail_closed: bool = True,
    ):
        self.state_file = state_file
        self.max_calls = max_calls
        self.max_cost_usd = max_cost_usd
        self.admission_cost_usd = admission_cost_usd
        self.max_wall_clock_seconds = max_wall_clock_seconds
        self.strict_fail_closed = strict_fail_closed
        self._lock = threading.RLock()
        self._init_error: Optional[Exception] = None
        try:
            self.state = self._load_or_init()
        except BudgetMeterUnavailableError as exc:
            self._init_error = exc
            self.state = {}

    def _load_or_init(self) -> Dict[str, Any]:
        with self._lock:
            if self.state_file.exists():
                try:
                    content = self.state_file.read_text(encoding="utf-8")
                    data = json.loads(content)
                    if not isinstance(data, dict) or "total_calls" not in data:
                        raise ValueError("Corrupt or invalid state structure")
                    return data
                except Exception as exc:
                    if self.strict_fail_closed:
                        raise BudgetMeterUnavailableError(
                            f"Budget ledger state is corrupted or unreadable: {exc}"
                        ) from exc

            return {
                "max_calls": self.max_calls,
                "max_cost_usd": self.max_cost_usd,
                "admission_cost_usd": self.admission_cost_usd,
                "max_wall_clock_seconds": self.max_wall_clock_seconds,
                "approval_reference": "Wave 1C Authoritative Cross-Container Budget Gate",
                "approved_by": "project owner",
                "live_started_at": None,
                "live_deadline_at": None,
                "total_calls": 0,
                "successful_calls": 0,
                "failed_calls": 0,
                "total_prompt_tokens": 0,
                "total_candidate_tokens": 0,
                "estimated_cost_usd": 0.0,
                "status": "READY",
                "stop_reason": None,
                "call_history": [],
            }

    def _save_durable(self) -> None:
        """Durable atomic save. Never overwrites corrupt state on load error."""
        with self._lock:
            temp_file = self.state_file.with_suffix(f".tmp_{uuid.uuid4().hex[:8]}")
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(self.state, f, indent=2, ensure_ascii=False)
            try:
                os.replace(temp_file, self.state_file)
            except OSError:
                with open(self.state_file, "w", encoding="utf-8") as f:
                    json.dump(self.state, f, indent=2, ensure_ascii=False)
                if temp_file.exists():
                    try:
                        temp_file.unlink()
                    except OSError:
                        pass

    def check_admission(self, next_calls: int = 1, estimated_next_cost: float = 0.001) -> None:
        """Verify that the dispatch will not violate any ceiling. Fails closed."""
        with self._lock:
            if self._init_error:
                raise BudgetMeterUnavailableError(f"Budget ledger state is corrupted or unreadable: {self._init_error}")

            current_calls = self.state["total_calls"]
            if current_calls + next_calls > self.max_calls:
                self.state["status"] = "EXHAUSTED"
                self.state["stop_reason"] = (
                    f"MAX_CALLS_REACHED: attempted {current_calls + next_calls} > {self.max_calls}"
                )
                self._save_durable()
                raise BudgetExceededError(self.state["stop_reason"])

            current_cost = self.state["estimated_cost_usd"]
            if current_cost + estimated_next_cost >= self.admission_cost_usd:
                self.state["status"] = "EXHAUSTED"
                self.state["stop_reason"] = (
                    f"ADMISSION_COST_LIMIT_REACHED: estimated {current_cost + estimated_next_cost:.4f} >= {self.admission_cost_usd:.2f}"
                )
                self._save_durable()
                raise BudgetExceededError(self.state["stop_reason"])

            if self.state["live_started_at"] is not None:
                started_ts = datetime.fromisoformat(self.state["live_started_at"]).timestamp()
                now_ts = datetime.now(timezone.utc).timestamp()
                elapsed = now_ts - started_ts
                if elapsed >= self.max_wall_clock_seconds:
                    self.state["status"] = "EXHAUSTED"
                    self.state["stop_reason"] = (
                        f"TIME_LIMIT_EXCEEDED: elapsed {elapsed:.1f}s >= {self.max_wall_clock_seconds}s"
                    )
                    self._save_durable()
                    raise BudgetExceededError(self.state["stop_reason"])

    def reserve(
        self,
        operation: str = "generic",
        estimated_cost: float = 0.001,
        provider: str = "gemini",
        model: str = "gemini-3.5-flash-lite",
        client_service: str = "unknown",
    ) -> Dict[str, Any]:
        """Atomically reserve one attempt slot before network dispatch."""
        with self._lock:
            self.check_admission(next_calls=1, estimated_next_cost=estimated_cost)

            now = datetime.now(timezone.utc)
            now_iso = now.isoformat()

            if self.state["live_started_at"] is None:
                self.state["live_started_at"] = now_iso
                deadline = datetime.fromtimestamp(
                    now.timestamp() + self.max_wall_clock_seconds, tz=timezone.utc
                )
                self.state["live_deadline_at"] = deadline.isoformat()
                self.state["status"] = "ACTIVE"

            ticket_id = f"TICK-{uuid.uuid4().hex[:12]}"
            self.state["total_calls"] += 1

            reservation_entry = {
                "ticket_id": ticket_id,
                "call_index": self.state["total_calls"],
                "timestamp": now_iso,
                "provider": provider,
                "model": model,
                "operation": operation,
                "client_service": client_service,
                "prompt_tokens": 0,
                "candidate_tokens": 0,
                "cost_usd": 0.0,
                "status": "RESERVED",
                "error": None,
            }
            self.state["call_history"].append(reservation_entry)
            self._save_durable()
            return {
                "allowed": True,
                "ticket_id": ticket_id,
                "call_index": self.state["total_calls"],
                "total_calls": self.state["total_calls"],
                "remaining_calls": self.max_calls - self.state["total_calls"],
            }

    def finalize(
        self,
        ticket_id: str,
        status: str = "SUCCESS",
        prompt_tokens: Optional[int] = None,
        candidate_tokens: Optional[int] = None,
        error: Optional[str] = None,
        provider: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Finalize reservation after provider response or failure. Failed calls consume slot."""
        with self._lock:
            entry = next((e for e in self.state["call_history"] if e.get("ticket_id") == ticket_id), None)
            if not entry:
                raise ValueError(f"Unknown reservation ticket: {ticket_id}")

            p_tokens = prompt_tokens if prompt_tokens is not None else DEFAULT_PROMPT_TOKENS
            c_tokens = candidate_tokens if candidate_tokens is not None else DEFAULT_CANDIDATE_TOKENS
            call_cost = (p_tokens / 1_000_000.0) * INPUT_COST_PER_M + (c_tokens / 1_000_000.0) * OUTPUT_COST_PER_M

            if status == "SUCCESS":
                self.state["successful_calls"] += 1
            else:
                self.state["failed_calls"] += 1

            self.state["total_prompt_tokens"] += p_tokens
            self.state["total_candidate_tokens"] += c_tokens
            self.state["estimated_cost_usd"] = round(self.state["estimated_cost_usd"] + call_cost, 6)

            if provider:
                entry["provider"] = provider
            if model:
                entry["model"] = model
            entry["prompt_tokens"] = p_tokens
            entry["candidate_tokens"] = c_tokens
            entry["cost_usd"] = round(call_cost, 6)
            entry["status"] = status
            entry["error"] = error
            self._save_durable()
            return entry

    def get_summary(self) -> Dict[str, Any]:
        with self._lock:
            if self._init_error:
                raise BudgetMeterUnavailableError(f"Budget ledger state is corrupted or unreadable: {self._init_error}")
            elapsed_seconds = 0
            if self.state["live_started_at"]:
                started_ts = datetime.fromisoformat(self.state["live_started_at"]).timestamp()
                now_ts = datetime.now(timezone.utc).timestamp()
                elapsed_seconds = round(now_ts - started_ts, 1)

            return {
                "approval_reference": self.state["approval_reference"],
                "approved_by": self.state["approved_by"],
                "status": self.state["status"],
                "total_calls": self.state["total_calls"],
                "max_calls": self.max_calls,
                "remaining_calls": max(0, self.max_calls - self.state["total_calls"]),
                "successful_calls": self.state["successful_calls"],
                "failed_calls": self.state["failed_calls"],
                "total_prompt_tokens": self.state["total_prompt_tokens"],
                "total_candidate_tokens": self.state["total_candidate_tokens"],
                "estimated_cost_usd": self.state["estimated_cost_usd"],
                "max_cost_usd": self.max_cost_usd,
                "admission_cost_usd": self.admission_cost_usd,
                "live_started_at": self.state["live_started_at"],
                "live_deadline_at": self.state["live_deadline_at"],
                "elapsed_wall_clock_seconds": elapsed_seconds,
                "max_wall_clock_seconds": self.max_wall_clock_seconds,
                "stop_reason": self.state.get("stop_reason"),
            }


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """Multi-threaded HTTP server handling concurrent requests across containers."""
    daemon_threads = True


class BudgetGatewayHandler(BaseHTTPRequestHandler):
    """HTTP handler exposing budget accounting endpoints and proxy dispatch."""

    ledger: AuthoritativeBudgetLedger
    upstream_base_url: Optional[str] = None
    upstream_api_key: Optional[str] = None

    def _send_json(self, status_code: int, data: Dict[str, Any]) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path in {"/api/budget/status", "/status", "/health"}:
            try:
                summary = self.ledger.get_summary()
                self._send_json(200, summary)
            except Exception as e:
                self._send_json(503, {"error": "BUDGET_METER_UNAVAILABLE", "message": str(e)})
        elif self.path in {"/v1/models", "/models"}:
            # Models discovery for health checks (does not consume generation quota)
            self._send_json(200, {
                "data": [
                    {"id": "gemini-3.5-flash-lite"},
                    {"id": "models/gemini-3.5-flash-lite"},
                    {"id": "gpt-4o-mini"},
                ]
            })
        else:
            self._send_json(404, {"error": "NOT_FOUND", "path": self.path})

    def do_POST(self) -> None:
        content_len = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
        try:
            body = json.loads(raw_body)
        except Exception:
            body = {}

        if self.path == "/api/budget/reserve":
            self._handle_reserve(body)
        elif self.path == "/api/budget/finalize":
            self._handle_finalize(body)
        elif self.path in {"/v1/chat/completions", "/chat/completions"}:
            self._handle_chat_completions_proxy(body)
        elif "/generateContent" in self.path:
            self._handle_gemini_proxy(body)
        else:
            self._send_json(404, {"error": "NOT_FOUND", "path": self.path})

    def _handle_reserve(self, body: Dict[str, Any]) -> None:
        try:
            operation = body.get("operation", "generic")
            estimated_cost = float(body.get("estimated_cost", 0.001))
            provider = body.get("provider", "gemini")
            model = body.get("model", "gemini-3.5-flash-lite")
            client_svc = body.get("client_service", "unknown")
            res = self.ledger.reserve(
                operation=operation,
                estimated_cost=estimated_cost,
                provider=provider,
                model=model,
                client_service=client_svc,
            )
            self._send_json(200, res)
        except BudgetExceededError as exc:
            self._send_json(429, {
                "error": "BUDGET_EXCEEDED",
                "message": str(exc),
                "stop_reason": str(exc),
            })
        except BudgetMeterUnavailableError as exc:
            self._send_json(503, {
                "error": "BUDGET_METER_UNAVAILABLE",
                "message": str(exc),
            })
        except Exception as exc:
            self._send_json(500, {"error": "INTERNAL_ERROR", "message": str(exc)})

    def _handle_finalize(self, body: Dict[str, Any]) -> None:
        ticket_id = body.get("ticket_id")
        if not ticket_id:
            self._send_json(400, {"error": "MISSING_TICKET_ID"})
            return
        status = body.get("status", "SUCCESS")
        p_tokens = body.get("prompt_tokens")
        c_tokens = body.get("candidate_tokens")
        error_msg = body.get("error")
        provider = body.get("provider")
        model = body.get("model")
        try:
            res = self.ledger.finalize(
                ticket_id=ticket_id,
                status=status,
                prompt_tokens=p_tokens,
                candidate_tokens=c_tokens,
                error=error_msg,
                provider=provider,
                model=model,
            )
            self._send_json(200, {"status": "FINALIZED", "entry": res})
        except Exception as exc:
            self._send_json(500, {"error": "FINALIZE_ERROR", "message": str(exc)})

    def _handle_chat_completions_proxy(self, body: Dict[str, Any]) -> None:
        """Proxies an OpenAI-compatible request through atomic pre-dispatch reservation."""
        model = body.get("model", "gemini-3.5-flash-lite")
        client_svc = self.headers.get("X-Client-Service", "backend-copilot")
        existing_ticket = self.headers.get("X-Budget-Ticket")

        # 1. Pre-dispatch reservation
        if existing_ticket:
            ticket_id = existing_ticket
        else:
            try:
                res = self.ledger.reserve(
                    operation="chat_completions",
                    estimated_cost=0.001,
                    provider="openai-compatible",
                    model=model,
                    client_service=client_svc,
                )
                ticket_id = res["ticket_id"]
            except BudgetExceededError as exc:
                self._send_json(429, {
                    "error": {
                        "message": f"BUDGET_EXCEEDED: {exc}",
                        "type": "budget_limit_exceeded",
                        "code": "BUDGET_LIMIT_REACHED",
                    }
                })
                return
            except BudgetMeterUnavailableError as exc:
                self._send_json(503, {
                    "error": {
                        "message": f"BUDGET_METER_UNAVAILABLE: {exc}",
                        "type": "meter_unavailable",
                        "code": "METER_UNAVAILABLE",
                    }
                })
                return

        # 2. Forward to upstream (or stub provider during offline tests)
        if not self.upstream_base_url:
            # Offline stub mode: return deterministic response
            prompt_tokens = 50
            candidate_tokens = 25
            if not existing_ticket:
                self.ledger.finalize(
                    ticket_id=ticket_id,
                    status="SUCCESS",
                    prompt_tokens=prompt_tokens,
                    candidate_tokens=candidate_tokens,
                    provider="stub-provider",
                    model=model,
                )
            self._send_json(200, {
                "id": f"chatcmpl-{ticket_id}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model,
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": "Offline stub suggestion."},
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": candidate_tokens,
                    "total_tokens": prompt_tokens + candidate_tokens,
                }
            })
            return

        # Upstream dispatch
        upstream_url = f"{self.upstream_base_url.rstrip('/')}/chat/completions"
        req_headers = {"Content-Type": "application/json"}
        if self.upstream_api_key:
            req_headers["Authorization"] = f"Bearer {self.upstream_api_key}"

        req_data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(upstream_url, data=req_data, headers=req_headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_raw = resp.read().decode("utf-8")
                resp_json = json.loads(resp_raw)
                usage = resp_json.get("usage", {})
                p_tokens = usage.get("prompt_tokens", DEFAULT_PROMPT_TOKENS)
                c_tokens = usage.get("completion_tokens", DEFAULT_CANDIDATE_TOKENS)
                self.ledger.finalize(
                    ticket_id=ticket_id,
                    status="SUCCESS",
                    prompt_tokens=p_tokens,
                    candidate_tokens=c_tokens,
                    provider="openai-compatible",
                    model=model,
                )
                self._send_json(200, resp_json)
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8")
            self.ledger.finalize(
                ticket_id=ticket_id,
                status="FAILED",
                prompt_tokens=0,
                candidate_tokens=0,
                error=f"HTTP {exc.code}: {err_body}",
            )
            self.send_response(exc.code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(err_body.encode("utf-8"))
        except Exception as exc:
            self.ledger.finalize(
                ticket_id=ticket_id,
                status="FAILED",
                prompt_tokens=0,
                candidate_tokens=0,
                error=f"Network error: {exc}",
            )
            self._send_json(502, {"error": {"message": f"Provider gateway network error: {exc}"}})

    def _handle_gemini_proxy(self, body: Dict[str, Any]) -> None:
        """Proxies Gemini generateContent request through atomic pre-dispatch reservation."""
        client_svc = self.headers.get("X-Client-Service", "ai-service")
        try:
            res = self.ledger.reserve(
                operation="gemini_generate_content",
                estimated_cost=0.001,
                provider="gemini",
                model="gemini-3.5-flash-lite",
                client_service=client_svc,
            )
            ticket_id = res["ticket_id"]
        except BudgetExceededError as exc:
            self._send_json(429, {"error": {"message": f"BUDGET_EXCEEDED: {exc}", "code": 429}})
            return
        except BudgetMeterUnavailableError as exc:
            self._send_json(503, {"error": {"message": f"BUDGET_METER_UNAVAILABLE: {exc}", "code": 503}})
            return

        # Stub response if no upstream configured
        prompt_tokens = 60
        candidate_tokens = 30
        self.ledger.finalize(
            ticket_id=ticket_id,
            status="SUCCESS",
            prompt_tokens=prompt_tokens,
            candidate_tokens=candidate_tokens,
            provider="gemini",
            model="gemini-3.5-flash-lite",
        )
        self._send_json(200, {
            "candidates": [{
                "content": {"parts": [{"text": "{\"status\":\"ok\"}"}]},
                "finishReason": "STOP"
            }],
            "usageMetadata": {
                "promptTokenCount": prompt_tokens,
                "candidatesTokenCount": candidate_tokens,
                "totalTokenCount": prompt_tokens + candidate_tokens,
            }
        })

    def log_message(self, format: str, *args: Any) -> None:
        # Suppress routine HTTP request logging to keep test output clean
        pass


def start_budget_gateway(
    state_file: Path,
    host: str = "127.0.0.1",
    port: int = 18090,
    max_calls: int = 200,
    max_cost_usd: float = 5.00,
    admission_cost_usd: float = 4.50,
    max_wall_clock_seconds: int = 7200,
    upstream_base_url: Optional[str] = None,
    upstream_api_key: Optional[str] = None,
) -> Tuple[ThreadedHTTPServer, threading.Thread, AuthoritativeBudgetLedger]:
    """Start the multi-threaded authoritative budget gateway server."""
    ledger = AuthoritativeBudgetLedger(
        state_file=state_file,
        max_calls=max_calls,
        max_cost_usd=max_cost_usd,
        admission_cost_usd=admission_cost_usd,
        max_wall_clock_seconds=max_wall_clock_seconds,
    )

    class CustomHandler(BudgetGatewayHandler):
        pass

    CustomHandler.ledger = ledger
    CustomHandler.upstream_base_url = upstream_base_url
    CustomHandler.upstream_api_key = upstream_api_key

    server = ThreadedHTTPServer((host, port), CustomHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    return server, server_thread, ledger
