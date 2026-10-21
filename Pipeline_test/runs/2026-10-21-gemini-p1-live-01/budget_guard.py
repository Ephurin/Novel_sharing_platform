import json
import os
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

RUN_DIR = Path(__file__).resolve().parent
STATE_FILE = RUN_DIR / "budget_state.json"

# Pricing rates per 1,000,000 tokens (Google AI Studio Gemini 3.5 Flash-Lite reference)
INPUT_COST_PER_M = 0.10
OUTPUT_COST_PER_M = 0.40

# Conservative fallback when usage tokens are missing or not reported
DEFAULT_PROMPT_TOKENS = 2000
DEFAULT_CANDIDATE_TOKENS = 800


class BudgetExceededError(RuntimeError):
    pass


class BudgetMeterUnavailableError(RuntimeError):
    pass


class BudgetGuard:
    def __init__(
        self,
        max_calls: int = 200,
        max_cost_usd: float = 5.00,
        admission_cost_usd: float = 4.50,
        max_wall_clock_seconds: int = 7200,
        state_file: Path = STATE_FILE,
        strict_fail_closed: bool = True,
    ):
        self.max_calls = max_calls
        self.max_cost_usd = max_cost_usd
        self.admission_cost_usd = admission_cost_usd
        self.max_wall_clock_seconds = max_wall_clock_seconds
        self.state_file = state_file
        self.strict_fail_closed = strict_fail_closed
        self._lock = threading.RLock()
        self.state = self._load_or_init()

    def _load_or_init(self) -> Dict[str, Any]:
        with self._lock:
            if self.state_file.exists():
                try:
                    with open(self.state_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if not isinstance(data, dict) or "total_calls" not in data:
                            raise ValueError("Corrupt state payload")
                        return data
                except Exception as exc:
                    if self.strict_fail_closed and self.state_file.stat().st_size > 0:
                        raise BudgetMeterUnavailableError(f"Budget meter state is corrupted or unreadable: {exc}")

            return {
                "max_calls": self.max_calls,
                "max_cost_usd": self.max_cost_usd,
                "admission_cost_usd": self.admission_cost_usd,
                "max_wall_clock_seconds": self.max_wall_clock_seconds,
                "approval_reference": "User explicit P1 budget authorization in ChatGPT on 2026-10-21",
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

    def _save(self) -> None:
        with self._lock:
            temp_file = self.state_file.with_suffix(f".tmp_{uuid.uuid4().hex[:6]}")
            try:
                with open(temp_file, "w", encoding="utf-8") as f:
                    json.dump(self.state, f, indent=2, ensure_ascii=False)
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
        """
        Verify that issuing the next call will not violate any budget limits.
        Fails closed with BudgetExceededError if limits are breached.
        """
        with self._lock:
            current_calls = self.state["total_calls"]
            if current_calls + next_calls > self.max_calls:
                self.state["status"] = "EXHAUSTED"
                self.state["stop_reason"] = f"MAX_CALLS_REACHED: attempted {current_calls + next_calls} > {self.max_calls}"
                self._save()
                raise BudgetExceededError(self.state["stop_reason"])

            current_cost = self.state["estimated_cost_usd"]
            if current_cost + estimated_next_cost >= self.admission_cost_usd:
                self.state["status"] = "EXHAUSTED"
                self.state["stop_reason"] = f"ADMISSION_COST_LIMIT_REACHED: estimated {current_cost + estimated_next_cost:.4f} >= {self.admission_cost_usd:.2f}"
                self._save()
                raise BudgetExceededError(self.state["stop_reason"])

            if self.state["live_started_at"] is not None:
                started_ts = datetime.fromisoformat(self.state["live_started_at"]).timestamp()
                now_ts = datetime.now(timezone.utc).timestamp()
                elapsed = now_ts - started_ts
                if elapsed >= self.max_wall_clock_seconds:
                    self.state["status"] = "EXHAUSTED"
                    self.state["stop_reason"] = f"TIME_LIMIT_EXCEEDED: elapsed {elapsed:.1f}s >= {self.max_wall_clock_seconds}s"
                    self._save()
                    raise BudgetExceededError(self.state["stop_reason"])

    def reserve_dispatch(
        self,
        estimated_cost: float = 0.001,
        operation: str = "generic",
        provider: str = "gemini",
        model: str = "gemini-3.5-flash-lite",
    ) -> str:
        """
        Mandatory pre-dispatch atomic reservation.
        Checks all ceilings BEFORE external dispatch and consumes one attempt slot immediately.
        Returns a ticket_id that must be finalized with finalize_dispatch().
        """
        with self._lock:
            self.check_admission(next_calls=1, estimated_next_cost=estimated_cost)

            now = datetime.now(timezone.utc)
            now_iso = now.isoformat()

            if self.state["live_started_at"] is None:
                self.state["live_started_at"] = now_iso
                deadline = datetime.fromtimestamp(now.timestamp() + self.max_wall_clock_seconds, tz=timezone.utc)
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
                "prompt_tokens": 0,
                "candidate_tokens": 0,
                "cost_usd": 0.0,
                "status": "RESERVED",
                "error": None,
            }
            self.state["call_history"].append(reservation_entry)
            self._save()
            return ticket_id

    def finalize_dispatch(
        self,
        ticket_id: str,
        provider: str,
        model: str,
        prompt_tokens: Optional[int] = None,
        candidate_tokens: Optional[int] = None,
        status: str = "SUCCESS",
        error: Optional[str] = None,
        operation: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Finalize a previously reserved provider dispatch.
        Computes token usage and estimated spend.
        Failed/timed-out calls consume the reserved slot.
        """
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

            entry["provider"] = provider
            entry["model"] = model
            if operation:
                entry["operation"] = operation
            entry["prompt_tokens"] = p_tokens
            entry["candidate_tokens"] = c_tokens
            entry["cost_usd"] = round(call_cost, 6)
            entry["status"] = status
            entry["error"] = error
            self._save()
            return entry

    def fail_dispatch(self, ticket_id: str, error: str) -> Dict[str, Any]:
        """Helper to finalize a dispatch as failed when a network/timeout error occurs."""
        return self.finalize_dispatch(
            ticket_id=ticket_id,
            provider="unknown",
            model="unknown",
            prompt_tokens=0,
            candidate_tokens=0,
            status="FAILED",
            error=error,
        )

    def record_call(
        self,
        provider: str,
        model: str,
        prompt_tokens: Optional[int] = None,
        candidate_tokens: Optional[int] = None,
        status: str = "SUCCESS",
        error: Optional[str] = None,
        operation: str = "generic",
    ) -> Dict[str, Any]:
        """
        Legacy direct record_call helper for backward compatibility.
        """
        ticket = self.reserve_dispatch(operation=operation, provider=provider, model=model)
        return self.finalize_dispatch(
            ticket_id=ticket,
            provider=provider,
            model=model,
            prompt_tokens=prompt_tokens,
            candidate_tokens=candidate_tokens,
            status=status,
            error=error,
            operation=operation,
        )

    def get_summary(self) -> Dict[str, Any]:
        with self._lock:
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
                "successful_calls": self.state["successful_calls"],
                "failed_calls": self.state["failed_calls"],
                "total_prompt_tokens": self.state["total_prompt_tokens"],
                "total_candidate_tokens": self.state["total_candidate_tokens"],
                "estimated_cost_usd": self.state["estimated_cost_usd"],
                "max_cost_usd": self.max_cost_usd,
                "live_started_at": self.state["live_started_at"],
                "live_deadline_at": self.state["live_deadline_at"],
                "elapsed_wall_clock_seconds": elapsed_seconds,
                "max_wall_clock_seconds": self.max_wall_clock_seconds,
                "stop_reason": self.state.get("stop_reason"),
            }


# =========================================================================
# Deterministic Offline Unit & Concurrency Test Suite
# =========================================================================

def test_budget_guard_200_201_boundary():
    """Verify that call 200 succeeds and call 201 is hard-rejected."""
    test_file = RUN_DIR / "budget_test_200.json"
    if test_file.exists():
        test_file.unlink()

    guard = BudgetGuard(max_calls=200, state_file=test_file)
    for i in range(200):
        t = guard.reserve_dispatch(operation=f"call_{i+1}")
        guard.finalize_dispatch(t, provider="test", model="test-model", prompt_tokens=10, candidate_tokens=10)

    assert guard.state["total_calls"] == 200

    # Call 201 must raise BudgetExceededError
    try:
        guard.reserve_dispatch(operation="call_201")
        assert False, "Call 201 should have been rejected"
    except BudgetExceededError as exc:
        assert "MAX_CALLS_REACHED" in str(exc)

    assert guard.state["total_calls"] == 200
    test_file.unlink()
    print("[PASS] test_budget_guard_200_201_boundary")


def test_budget_guard_concurrent_contention_on_last_slot():
    """Verify thread-safety when multiple concurrent threads contest the final available call slot."""
    test_file = RUN_DIR / "budget_test_concurrency.json"
    if test_file.exists():
        test_file.unlink()

    guard = BudgetGuard(max_calls=10, state_file=test_file)
    # Fill 9 slots
    for i in range(9):
        t = guard.reserve_dispatch(operation=f"fill_{i}")
        guard.finalize_dispatch(t, provider="test", model="test-model", prompt_tokens=10, candidate_tokens=10)

    # 10 threads concurrently contest the single remaining slot (slot 10)
    successes = []
    failures = []

    def attempt_reservation():
        try:
            t = guard.reserve_dispatch(operation="contention")
            guard.finalize_dispatch(t, provider="test", model="test-model", prompt_tokens=10, candidate_tokens=10)
            successes.append(t)
        except BudgetExceededError:
            failures.append(1)

    threads = [threading.Thread(target=attempt_reservation) for _ in range(10)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()

    assert len(successes) == 1, f"Expected exactly 1 success, got {len(successes)}"
    assert len(failures) == 9, f"Expected exactly 9 failures, got {len(failures)}"
    assert guard.state["total_calls"] == 10
    test_file.unlink()
    print("[PASS] test_budget_guard_concurrent_contention_on_last_slot")


def test_budget_guard_expiry_at_2h():
    """Verify that when 2h (7200s) has elapsed, reservation is rejected immediately."""
    test_file = RUN_DIR / "budget_test_expiry.json"
    if test_file.exists():
        test_file.unlink()

    guard = BudgetGuard(max_calls=200, max_wall_clock_seconds=7200, state_file=test_file)
    t = guard.reserve_dispatch(operation="call_1")
    guard.finalize_dispatch(t, provider="test", model="test-model", prompt_tokens=10, candidate_tokens=10)

    # Artificially set live_started_at to 7201 seconds ago
    old_ts = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() - 7205, tz=timezone.utc).isoformat()
    guard.state["live_started_at"] = old_ts
    guard._save()

    try:
        guard.reserve_dispatch(operation="expired_call")
        assert False, "Expired call should have been rejected"
    except BudgetExceededError as exc:
        assert "TIME_LIMIT_EXCEEDED" in str(exc)

    test_file.unlink()
    print("[PASS] test_budget_guard_expiry_at_2h")


def test_budget_guard_admission_cost_limit():
    """Verify admission limit ($4.50 threshold on $5.00 ceiling)."""
    test_file = RUN_DIR / "budget_test_cost.json"
    if test_file.exists():
        test_file.unlink()

    guard = BudgetGuard(max_cost_usd=5.00, admission_cost_usd=4.50, state_file=test_file)
    guard.state["estimated_cost_usd"] = 4.499
    guard._save()

    try:
        guard.reserve_dispatch(estimated_cost=0.002, operation="over_admission")
        assert False, "Over admission cost call should have been rejected"
    except BudgetExceededError as exc:
        assert "ADMISSION_COST_LIMIT_REACHED" in str(exc)

    test_file.unlink()
    print("[PASS] test_budget_guard_admission_cost_limit")


def test_budget_guard_failed_call_consumes_attempt():
    """Verify that a failed or timed-out call still permanently consumes a call attempt."""
    test_file = RUN_DIR / "budget_test_fail.json"
    if test_file.exists():
        test_file.unlink()

    guard = BudgetGuard(max_calls=2, state_file=test_file)
    t = guard.reserve_dispatch(operation="will_fail")
    assert guard.state["total_calls"] == 1

    guard.fail_dispatch(t, error="Network timeout 504 Gateway Timeout")
    assert guard.state["total_calls"] == 1
    assert guard.state["failed_calls"] == 1
    assert guard.state["successful_calls"] == 0

    t2 = guard.reserve_dispatch(operation="call_2")
    guard.finalize_dispatch(t2, provider="test", model="test-model", prompt_tokens=10, candidate_tokens=10)
    assert guard.state["total_calls"] == 2

    # Call 3 should fail closed
    try:
        guard.reserve_dispatch(operation="call_3")
        assert False, "Should be exhausted"
    except BudgetExceededError:
        pass

    test_file.unlink()
    print("[PASS] test_budget_guard_failed_call_consumes_attempt")


def test_budget_guard_corrupt_state_handling():
    """Verify that a corrupted state file triggers BudgetMeterUnavailableError."""
    test_file = RUN_DIR / "budget_test_corrupt.json"
    test_file.write_text("{NOT_VALID_JSON", encoding="utf-8")

    try:
        BudgetGuard(state_file=test_file, strict_fail_closed=True)
        assert False, "Corrupt state file should fail closed"
    except BudgetMeterUnavailableError as exc:
        assert "corrupted" in str(exc)

    test_file.unlink()
    print("[PASS] test_budget_guard_corrupt_state_handling")


def test_budget_guard_restart_persistence():
    """Verify that reloading state from disk preserves previous call count and budget."""
    test_file = RUN_DIR / "budget_test_persist.json"
    if test_file.exists():
        test_file.unlink()

    guard1 = BudgetGuard(max_calls=5, state_file=test_file)
    t = guard1.reserve_dispatch(operation="persist_test")
    guard1.finalize_dispatch(t, provider="test", model="test-model", prompt_tokens=100, candidate_tokens=50)
    assert guard1.state["total_calls"] == 1

    # New instance loading from same file
    guard2 = BudgetGuard(max_calls=5, state_file=test_file)
    assert guard2.state["total_calls"] == 1
    assert guard2.state["successful_calls"] == 1
    assert len(guard2.state["call_history"]) == 1

    test_file.unlink()
    print("[PASS] test_budget_guard_restart_persistence")


def run_all_budget_tests():
    print("=" * 60)
    print("RUNNING DETERMINISTIC BUDGET GUARD FAULT-INJECTION TESTS")
    print("=" * 60)
    test_budget_guard_200_201_boundary()
    test_budget_guard_concurrent_contention_on_last_slot()
    test_budget_guard_expiry_at_2h()
    test_budget_guard_admission_cost_limit()
    test_budget_guard_failed_call_consumes_attempt()
    test_budget_guard_corrupt_state_handling()
    test_budget_guard_restart_persistence()
    print("=" * 60)
    print("ALL 7 DETERMINISTIC BUDGET GUARD TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        run_all_budget_tests()
    else:
        g = BudgetGuard()
        print(json.dumps(g.get_summary(), indent=2))

