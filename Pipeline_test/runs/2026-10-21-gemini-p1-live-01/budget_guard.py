"""
Budget Guard and metering system for P1 Live Testing.
Enforces owner-approved ceilings:
- Max 200 provider-call attempts (hard stop before call 201)
- Max USD 5.00 total spend (admission stop at USD 4.50)
- Max 2 hours elapsed live wall-clock time from first provider call
"""

import json
import os
import sys
import time
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


class BudgetGuard:
    def __init__(
        self,
        max_calls: int = 200,
        max_cost_usd: float = 5.00,
        admission_cost_usd: float = 4.50,
        max_wall_clock_seconds: int = 7200,
        state_file: Path = STATE_FILE,
    ):
        self.max_calls = max_calls
        self.max_cost_usd = max_cost_usd
        self.admission_cost_usd = admission_cost_usd
        self.max_wall_clock_seconds = max_wall_clock_seconds
        self.state_file = state_file
        self.state = self._load_or_init()

    def _load_or_init(self) -> Dict[str, Any]:
        if self.state_file.exists():
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

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
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(self.state, f, indent=2, ensure_ascii=False)

    def check_admission(self, next_calls: int = 1, estimated_next_cost: float = 0.001) -> None:
        """
        Verify that issuing the next call will not violate any budget limits.
        Fails closed with BudgetExceededError if limits are breached.
        """
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
        Record a live call attempt and meter token usage and estimated spend.
        """
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()

        if self.state["live_started_at"] is None:
            self.state["live_started_at"] = now_iso
            deadline = datetime.fromtimestamp(now.timestamp() + self.max_wall_clock_seconds, tz=timezone.utc)
            self.state["live_deadline_at"] = deadline.isoformat()
            self.state["status"] = "ACTIVE"

        p_tokens = prompt_tokens if prompt_tokens is not None else DEFAULT_PROMPT_TOKENS
        c_tokens = candidate_tokens if candidate_tokens is not None else DEFAULT_CANDIDATE_TOKENS

        call_cost = (p_tokens / 1_000_000.0) * INPUT_COST_PER_M + (c_tokens / 1_000_000.0) * OUTPUT_COST_PER_M

        self.state["total_calls"] += 1
        if status == "SUCCESS":
            self.state["successful_calls"] += 1
        else:
            self.state["failed_calls"] += 1

        self.state["total_prompt_tokens"] += p_tokens
        self.state["total_candidate_tokens"] += c_tokens
        self.state["estimated_cost_usd"] = round(self.state["estimated_cost_usd"] + call_cost, 6)

        call_entry = {
            "call_index": self.state["total_calls"],
            "timestamp": now_iso,
            "provider": provider,
            "model": model,
            "operation": operation,
            "prompt_tokens": p_tokens,
            "candidate_tokens": c_tokens,
            "cost_usd": round(call_cost, 6),
            "status": status,
            "error": error,
        }
        self.state["call_history"].append(call_entry)
        self._save()
        return call_entry

    def get_summary(self) -> Dict[str, Any]:
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


def test_budget_guard_limits():
    """Deterministic offline test of budget guard limits."""
    test_file = RUN_DIR / "budget_test_state.json"
    if test_file.exists():
        test_file.unlink()

    guard = BudgetGuard(max_calls=3, max_cost_usd=0.01, admission_cost_usd=0.005, max_wall_clock_seconds=10, state_file=test_file)
    # Check admission 1
    guard.check_admission()
    guard.record_call(provider="test", model="test-model", prompt_tokens=1000, candidate_tokens=500, operation="smoke")
    assert guard.state["total_calls"] == 1

    # Check admission 2
    guard.check_admission()
    guard.record_call(provider="test", model="test-model", prompt_tokens=1000, candidate_tokens=500, operation="smoke")
    assert guard.state["total_calls"] == 2

    # Check admission 3
    guard.check_admission()
    guard.record_call(provider="test", model="test-model", prompt_tokens=1000, candidate_tokens=500, operation="smoke")
    assert guard.state["total_calls"] == 3

    # Check admission 4 should fail (exceeds max_calls 3)
    try:
        guard.check_admission()
        assert False, "Expected BudgetExceededError"
    except BudgetExceededError as e:
        assert "MAX_CALLS_REACHED" in str(e)

    test_file.unlink()
    print("test_budget_guard_limits: PASS")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        test_budget_guard_limits()
    else:
        g = BudgetGuard()
        print(json.dumps(g.get_summary(), indent=2))
