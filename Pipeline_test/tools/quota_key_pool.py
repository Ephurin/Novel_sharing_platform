"""Multi-key free-tier quota pool for the live safety gateway.

Each upstream key belongs to its own Google project with its own free-tier limits, so each key gets
its own durable FreeTierQuotaLedger (own state file, own attestation). The pool exposes the same
surface as a single ledger: `reserve` admits the call on the key with the most RPM room, the ticket
remembers its key, and `finalize` goes back to that key's ledger.

Key values never leave this module except through `key_for(ticket)`; summaries and logs use the
1-based key slot only.
"""
from __future__ import annotations

import math
import threading
import time
from pathlib import Path
from typing import Any

try:
    from Pipeline_test.tools.quota_controller import (
        FreeTierQuotaLedger,
        QuotaExceededError,
        RPDLimitExceeded,
        RPMLimitExceeded,
    )
except ImportError:  # pragma: no cover - container layout
    from quota_controller import (  # type: ignore[no-redef]
        FreeTierQuotaLedger,
        QuotaExceededError,
        RPDLimitExceeded,
        RPMLimitExceeded,
    )

DEFAULT_PROVIDER_COOLDOWN_SECONDS = 60


def read_keys_file(path: str | Path) -> list[str]:
    """One key per line; blank lines and `#` comments ignored; duplicates dropped in order."""
    keys: list[str] = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        value = line.strip()
        if value and not value.startswith("#") and value not in keys:
            keys.append(value)
    return keys


def slot_state_file(state_file: str | Path, index: int) -> Path:
    """Slot 0 keeps the original state file so a single-key ledger carries over unchanged."""
    path = Path(state_file)
    return path if index == 0 else path.with_name(f"{path.stem}.k{index + 1}{path.suffix}")


class QuotaKeyPool:
    def __init__(self, keys: list[str], ledgers: list[FreeTierQuotaLedger]):
        if not keys or len(keys) != len(ledgers):
            raise ValueError("QuotaKeyPool needs one ledger per key")
        self._keys = list(keys)
        self._ledgers = list(ledgers)
        self._cooldown_until = [0.0] * len(keys)
        self._ticket_slot: dict[str, int] = {}
        self._lock = threading.Lock()

    @classmethod
    def open(
        cls,
        state_file: str | Path,
        keys: list[str],
        *,
        attestations: list[dict[str, Any]] | dict[str, Any] | None,
        **ledger_kwargs: Any,
    ) -> "QuotaKeyPool":
        if isinstance(attestations, list):
            if len(attestations) != len(keys):
                raise ValueError("One operator attestation per upstream key is required")
            per_key = attestations
        else:
            per_key = [attestations] * len(keys)
        ledgers = [
            FreeTierQuotaLedger(slot_state_file(state_file, i), operator_attestation=per_key[i], **ledger_kwargs)
            for i in range(len(keys))
        ]
        return cls(keys, ledgers)

    # --- single-ledger compatible surface -------------------------------------------------
    @property
    def size(self) -> int:
        return len(self._keys)

    def _healthy(self) -> None:
        for ledger in self._ledgers:
            ledger._healthy()

    def set_live_free_tier_enabled(self, enabled: bool) -> None:
        for ledger in self._ledgers:
            ledger.set_live_free_tier_enabled(enabled)

    def update_operator_attestation(self, attestation: dict[str, Any]) -> None:
        for ledger in self._ledgers:
            ledger.update_operator_attestation(attestation)

    def record_denial(self, reason: str, client_service: str = "unknown", operation: str = "generic") -> None:
        # Denials before admission (model, private notes) are not tied to a key.
        self._ledgers[0].record_denial(reason, client_service=client_service, operation=operation)

    def close(self) -> None:
        for ledger in self._ledgers:
            ledger.close()

    def _order(self, model: str, now: float) -> list[int]:
        def load(i: int) -> tuple[int, int]:
            recent = [e for e in self._ledgers[i].state.get("call_history", [])
                      if e.get("model") == model and float(e.get("timestamp", 0)) >= now - 60.0]
            return (len(recent), int(self._ledgers[i].state.get("rpd_call_count", 0)))
        return sorted(range(len(self._keys)), key=lambda i: (load(i), i))

    def reserve(self, *, model: str, now_override: float | None = None, **kwargs: Any) -> dict[str, Any]:
        now = float(now_override) if now_override is not None else time.time()
        denials: list[QuotaExceededError] = []
        with self._lock:
            order = self._order(str(model or "").strip().removeprefix("models/"), now)
        for i in order:
            wait = self._cooldown_until[i] - now
            if wait > 0:
                denials.append(RPMLimitExceeded("RPM_LIMIT_EXCEEDED", retry_after=max(1, math.ceil(wait))))
                continue
            try:
                ticket = self._ledgers[i].reserve(model=model, now_override=now_override, **kwargs)
            except QuotaExceededError as exc:
                denials.append(exc)
                continue
            with self._lock:
                self._ticket_slot[ticket["ticket_id"]] = i
            return {**ticket, "key_slot": i + 1}
        raise _soonest(denials)

    def finalize(self, ticket_id: str, status: str, **kwargs: Any) -> Any:
        with self._lock:
            i = self._ticket_slot.pop(ticket_id, 0)
        return self._ledgers[i].finalize(ticket_id, status, **kwargs)

    def key_for(self, ticket: dict[str, Any]) -> str:
        return self._keys[int(ticket["key_slot"]) - 1]

    def cool_down(self, ticket: dict[str, Any], retry_after: Any = None) -> None:
        """The provider rate-limited this key (its project); skip it until the window passes."""
        try:
            seconds = max(1, min(3600, int(float(retry_after))))
        except (TypeError, ValueError):
            seconds = DEFAULT_PROVIDER_COOLDOWN_SECONDS
        self._cooldown_until[int(ticket["key_slot"]) - 1] = time.time() + seconds

    def get_summary(self) -> dict[str, Any]:
        summaries = [ledger.get_summary() for ledger in self._ledgers]
        merged = dict(summaries[0])
        for field in ("rpd_call_count", "total_calls", "current_in_flight", "denied_count"):
            if all(isinstance(s.get(field), int) for s in summaries):
                merged[field] = sum(s[field] for s in summaries)
        now = time.time()
        merged["key_pool"] = [
            {"key_slot": i + 1, "cooldown_seconds": max(0, math.ceil(self._cooldown_until[i] - now)),
             "project_id_fingerprint": (s.get("operator_attestation") or {}).get("project_id_fingerprint"),
             **{k: s.get(k) for k in ("rpd_call_count", "total_calls", "current_in_flight", "model_summaries")}}
            for i, s in enumerate(summaries)
        ]
        return merged


def _soonest(denials: list[QuotaExceededError]) -> QuotaExceededError:
    """All keys refused: report the denial that clears first (daily limits only when every key is out)."""
    retryable = [d for d in denials if not isinstance(d, RPDLimitExceeded)]
    if not retryable:
        return denials[0]
    return min(retryable, key=lambda d: d.retry_after if d.retry_after is not None else 10**6)
