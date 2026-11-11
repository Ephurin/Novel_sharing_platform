"""Application service for structured AI brainstorming suggestions.

Generates structured proposals for World Rules, Character Seeds, and Future
Chapter Events. All proposals carry status `model_proposed`, strictly separated
from Canon / historical records. Suggestions are grounded in approved Story
Brain memory using verified effective Canon lineage, protected against hallucinated
identities, quota-aware, CAS-guarded with fail-closed semantics, and backed by
durable, atomic, race-safe idempotency.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from api.brainstorm_schemas import (
    BrainstormParticipant,
    BrainstormProvenance,
    BrainstormRequest,
    BrainstormResponse,
    ProposedCharacter,
    ProposedFutureEvent,
    ProposedWorldRule,
)
from domain.errors import IdempotencyConflictError
from domain.projection import ProjectionError, WorldRuleLineageError, resolve_effective_facts
from infrastructure.database import session_scope
from infrastructure.orm_models import AnalysisRunRecord, StoryBrainRecord

logger = logging.getLogger("brainstorm-service")

MAX_SUGGESTIONS_PER_CATEGORY = 20
MAX_TEXT_LENGTH = 4000
MAX_SHORT_TEXT_LENGTH = 256


class BrainstormService:
    """Orchestrates structured brainstorming suggestions without mutating Canon."""

    # Class-level in-memory receipt storage for in-memory repo / unit tests
    _in_memory_receipts: dict[str, dict[str, Any]] = {}
    _in_memory_lock = threading.Lock()
    _in_memory_condition = threading.Condition(_in_memory_lock)

    def __init__(self, repository: Any, llm_service: Any = None) -> None:
        self._repository = repository
        self._llm_service = llm_service

    def _scope(self, tenant_id: str) -> None:
        configured = getattr(self._repository, "_tenant_id", None)
        if configured is not None and str(configured) != str(tenant_id):
            raise HTTPException(403, detail={"code": "TENANT_SCOPE_MISMATCH"})

    def _verify_novel_ownership(self, novel_id: str, author_id: str) -> None:
        """Verify that the caller author owns the novel, failing closed if mismatched, deleted, or missing."""
        if hasattr(self._repository, "_session_factory"):
            try:
                with session_scope(self._repository._session_factory) as session:
                    n_id = self._repository._novel_id(novel_id)
                    novel_row = session.execute(
                        text("SELECT author_id, deleted_at FROM novels WHERE novel_id = :n"),
                        {"n": n_id},
                    ).first()
            except Exception as exc:
                raise HTTPException(
                    503,
                    detail={
                        "code": "OWNERSHIP_STORE_UNAVAILABLE",
                        "message": f"Novel ownership lookup failed: {exc}",
                    },
                ) from exc

            if novel_row is None:
                raise HTTPException(
                    404,
                    detail={
                        "code": "NOVEL_NOT_FOUND",
                        "message": f"Novel '{novel_id}' not found",
                    },
                )
            db_author = str(novel_row[0])
            deleted_at = novel_row[1]
            if deleted_at is not None:
                raise HTTPException(
                    404,
                    detail={
                        "code": "NOVEL_DELETED",
                        "message": f"Novel '{novel_id}' has been deleted",
                    },
                )
            if db_author != str(author_id):
                raise HTTPException(
                    403,
                    detail={
                        "code": "NOVEL_OWNERSHIP_MISMATCH",
                        "message": f"Author '{author_id}' does not own novel '{novel_id}'",
                    },
                )
        elif hasattr(self._repository, "_novel_authors"):
            if str(novel_id) not in self._repository._novel_authors:
                raise HTTPException(
                    404,
                    detail={
                        "code": "NOVEL_NOT_FOUND",
                        "message": f"Novel '{novel_id}' not found",
                    },
                )
            expected_author = self._repository._novel_authors[str(novel_id)]
            if str(expected_author) != str(author_id):
                raise HTTPException(
                    403,
                    detail={
                        "code": "NOVEL_OWNERSHIP_MISMATCH",
                        "message": f"Author '{author_id}' does not own novel '{novel_id}'",
                    },
                )

    def _get_active_plan_info(
        self, novel_id: str, actor_id: str | None, expected_plan_version: int | None
    ) -> tuple[int | None, int]:
        """Read active Story Plan info, failing closed on errors or CAS mismatches."""
        if expected_plan_version is not None:
            if not actor_id:
                raise HTTPException(
                    401,
                    detail={
                        "code": "BRAINSTORM_IDENTITY_REQUIRED",
                        "message": "Author ID required when expected_plan_version is specified",
                    },
                )
            if not getattr(self._repository, "supports_plan_edit_v1", False):
                raise HTTPException(
                    409,
                    detail={
                        "code": "PLAN_VERSION_CONFLICT",
                        "message": f"Expected plan version {expected_plan_version}, but plan store is not supported",
                        "actual_plan_version": None,
                        "expected_plan_version": expected_plan_version,
                    },
                )
            try:
                data = self._repository.read_plans(novel_id, actor_id)
            except KeyError:
                raise HTTPException(
                    409,
                    detail={
                        "code": "PLAN_VERSION_CONFLICT",
                        "message": f"Expected plan version {expected_plan_version}, but no plan was found for author",
                        "actual_plan_version": None,
                        "expected_plan_version": expected_plan_version,
                    },
                )
            except Exception as exc:
                raise HTTPException(
                    503,
                    detail={
                        "code": "PLAN_SERVICE_UNAVAILABLE",
                        "message": f"Plan read failed: {exc}",
                    },
                ) from exc

            active_id = data.get("active_plan_id")
            if not active_id:
                raise HTTPException(
                    409,
                    detail={
                        "code": "PLAN_VERSION_CONFLICT",
                        "message": f"Expected plan version {expected_plan_version}, but novel has no active plan",
                        "actual_plan_version": None,
                        "expected_plan_version": expected_plan_version,
                    },
                )
            plans = data.get("plans", [])
            active_plan = next((p for p in plans if p.get("plan_id") == active_id), None)
            if not active_plan:
                raise HTTPException(
                    409,
                    detail={
                        "code": "PLAN_VERSION_CONFLICT",
                        "message": f"Expected plan version {expected_plan_version}, but active plan not found in plan list",
                        "actual_plan_version": None,
                        "expected_plan_version": expected_plan_version,
                    },
                )
            plan_version = active_plan.get("plan_version", 1)
            if plan_version != expected_plan_version:
                raise HTTPException(
                    409,
                    detail={
                        "code": "PLAN_VERSION_CONFLICT",
                        "message": f"Plan version conflict: expected {expected_plan_version}, got {plan_version}",
                        "actual_plan_version": plan_version,
                        "expected_plan_version": expected_plan_version,
                    },
                )
            objectives = active_plan.get("objectives", [])
            max_ch = max([o.get("target_chapter", 1) for o in objectives], default=1)
            return plan_version, max_ch

        # expected_plan_version is None: optional lookup
        if not actor_id or not getattr(self._repository, "supports_plan_edit_v1", False):
            return None, 1
        try:
            data = self._repository.read_plans(novel_id, actor_id)
            active_id = data.get("active_plan_id")
            if not active_id:
                return None, 1
            plans = data.get("plans", [])
            active_plan = next((p for p in plans if p.get("plan_id") == active_id), None)
            if not active_plan:
                return None, 1
            plan_version = active_plan.get("plan_version", 1)
            objectives = active_plan.get("objectives", [])
            max_ch = max([o.get("target_chapter", 1) for o in objectives], default=1)
            return plan_version, max_ch
        except KeyError:
            return None, 1
        except Exception as exc:
            raise HTTPException(
                503,
                detail={
                    "code": "PLAN_SERVICE_UNAVAILABLE",
                    "message": f"Plan read failed: {exc}",
                },
            ) from exc

    def _get_receipt(self, novel_id: str, scoped_key: str) -> dict[str, Any] | None:
        """Lookup an idempotency receipt from durable store (PostgreSQL) or in-memory."""
        if hasattr(self._repository, "_session_factory"):
            try:
                with session_scope(self._repository._session_factory) as session:
                    n_id = self._repository._novel_id(novel_id)
                    rec = session.scalar(
                        select(AnalysisRunRecord).where(
                            AnalysisRunRecord.idempotency_key == scoped_key,
                            AnalysisRunRecord.tenant_id == self._repository._tenant_id,
                            AnalysisRunRecord.novel_id == n_id,
                        )
                    )
                    if rec is not None:
                        audit = rec.entity_candidate_audit or {}
                        return {
                            "status": rec.status,
                            "input_hash": rec.input_hash,
                            "response": audit.get("response"),
                            "author_id": audit.get("author_id"),
                            "lease_token": audit.get("lease_token"),
                            "lease_expires_at": audit.get("lease_expires_at", 0),
                        }
                    return None
            except Exception as exc:
                raise HTTPException(
                    503,
                    detail={
                        "code": "IDEMPOTENCY_STORE_UNAVAILABLE",
                        "message": f"Idempotency store read failed: {exc}",
                    },
                ) from exc
        else:
            with BrainstormService._in_memory_lock:
                rec = BrainstormService._in_memory_receipts.get(scoped_key)
                return dict(rec) if rec is not None else None

    def _reserve_or_takeover_receipt(
        self, brain: Any, novel_id: str, scoped_key: str, input_hash: str, author_id: str
    ) -> tuple[bool, str | None, dict[str, Any] | None]:
        """Atomically reserve or take over an idempotency slot under row-lock.

        Returns:
            (True, lease_token, None) if reserved or taken over.
            (False, None, completed_response) if already completed.
            (False, None, None) if actively pending under valid lease held by another worker.
        """
        now = time.time()
        lease_expires_at = now + 30.0
        lease_token = str(uuid.uuid4())

        if hasattr(self._repository, "_session_factory"):
            try:
                with session_scope(self._repository._session_factory) as session:
                    n_id = self._repository._novel_id(novel_id)
                    rec = session.scalar(
                        select(AnalysisRunRecord)
                        .where(
                            AnalysisRunRecord.idempotency_key == scoped_key,
                            AnalysisRunRecord.tenant_id == self._repository._tenant_id,
                            AnalysisRunRecord.novel_id == n_id,
                        )
                        .with_for_update()
                    )
                    if rec is None:
                        b_id = None
                        if hasattr(brain, "metadata") and isinstance(brain.metadata, dict):
                            m_id = brain.metadata.get("brain_id")
                            if m_id:
                                try:
                                    b_id = uuid.UUID(str(m_id))
                                except (ValueError, TypeError):
                                    pass
                        if b_id is None:
                            b_id = session.scalar(
                                select(StoryBrainRecord.id).where(*self._repository._scope(StoryBrainRecord, n_id))
                            )
                        if b_id is None:
                            b_id = n_id

                        new_rec = AnalysisRunRecord(
                            id=uuid.uuid4(),
                            story_brain_id=b_id,
                            tenant_id=self._repository._tenant_id,
                            novel_id=n_id,
                            operation="brainstorm",
                            status="pending",
                            idempotency_key=scoped_key,
                            input_hash=input_hash,
                            pipeline_version="brainstorm-v1",
                            entity_candidate_audit={
                                "author_id": author_id,
                                "input_hash": input_hash,
                                "lease_token": lease_token,
                                "lease_expires_at": lease_expires_at,
                            },
                        )
                        session.add(new_rec)
                        session.flush()
                        return True, lease_token, None

                    # rec already exists: verify input hash
                    if rec.input_hash != input_hash:
                        raise HTTPException(
                            409,
                            detail={
                                "code": "IDEMPOTENCY_CONFLICT",
                                "message": "Idempotency key reused with conflicting payload",
                            },
                        )

                    audit = dict(rec.entity_candidate_audit or {})
                    if rec.status == "completed" and audit.get("response"):
                        return False, None, audit["response"]

                    rec_lease_exp = audit.get("lease_expires_at", 0)
                    # Safe re-reservation / takeover if failed or lease expired
                    if rec.status == "failed" or (rec.status == "pending" and now > rec_lease_exp):
                        rec.status = "pending"
                        audit["lease_token"] = lease_token
                        audit["lease_expires_at"] = lease_expires_at
                        audit["error"] = None
                        rec.entity_candidate_audit = audit
                        session.flush()
                        return True, lease_token, None

                    return False, None, None
            except IntegrityError:
                # Concurrent insert won the race; another worker holds the slot
                return False, None, None
            except HTTPException:
                raise
            except Exception as exc:
                logger.error("DB exception during idempotency reservation: %s", exc)
                raise HTTPException(
                    503,
                    detail={
                        "code": "IDEMPOTENCY_STORE_UNAVAILABLE",
                        "message": f"Idempotency reservation store unavailable: {exc}",
                    },
                ) from exc
        else:
            with BrainstormService._in_memory_lock:
                rec = BrainstormService._in_memory_receipts.get(scoped_key)
                if rec is None:
                    BrainstormService._in_memory_receipts[scoped_key] = {
                        "status": "pending",
                        "input_hash": input_hash,
                        "author_id": author_id,
                        "response": None,
                        "lease_token": lease_token,
                        "lease_expires_at": lease_expires_at,
                    }
                    return True, lease_token, None

                if rec["input_hash"] != input_hash:
                    raise HTTPException(
                        409,
                        detail={
                            "code": "IDEMPOTENCY_CONFLICT",
                            "message": "Idempotency key reused with conflicting payload",
                        },
                    )

                if rec["status"] == "completed" and rec.get("response"):
                    return False, None, rec["response"]

                rec_lease_exp = rec.get("lease_expires_at", 0)
                if rec["status"] == "failed" or (rec["status"] == "pending" and now > rec_lease_exp):
                    rec["status"] = "pending"
                    rec["lease_token"] = lease_token
                    rec["lease_expires_at"] = lease_expires_at
                    rec["error"] = None
                    return True, lease_token, None

                return False, None, None

    def _complete_receipt(
        self, novel_id: str, scoped_key: str, lease_token: str, response: dict[str, Any]
    ) -> None:
        """Mark an idempotency receipt as completed under lease token validation."""
        if hasattr(self._repository, "_session_factory"):
            try:
                with session_scope(self._repository._session_factory) as session:
                    n_id = self._repository._novel_id(novel_id)
                    rec = session.scalar(
                        select(AnalysisRunRecord)
                        .where(
                            AnalysisRunRecord.idempotency_key == scoped_key,
                            AnalysisRunRecord.tenant_id == self._repository._tenant_id,
                            AnalysisRunRecord.novel_id == n_id,
                        )
                        .with_for_update()
                    )
                    if rec is None:
                        raise HTTPException(
                            503,
                            detail={
                                "code": "IDEMPOTENCY_STORE_UNAVAILABLE",
                                "message": "Idempotency record vanished during completion",
                            },
                        )
                    audit = dict(rec.entity_candidate_audit or {})
                    if audit.get("lease_token") != lease_token:
                        logger.warning(
                            "Lease token mismatch on completion: expected %s, got %s",
                            audit.get("lease_token"),
                            lease_token,
                        )
                        raise HTTPException(
                            409,
                            detail={
                                "code": "IDEMPOTENCY_LEASE_EXPIRED",
                                "message": "Idempotency lease expired or taken over by another worker",
                            },
                        )
                    rec.status = "completed"
                    audit["response"] = response
                    audit["lease_expires_at"] = 0
                    rec.entity_candidate_audit = audit
                    session.flush()
            except HTTPException:
                raise
            except Exception as exc:
                logger.error("DB exception during receipt completion: %s", exc)
                raise HTTPException(
                    503,
                    detail={
                        "code": "IDEMPOTENCY_STORE_UNAVAILABLE",
                        "message": f"Failed to persist brainstorm completion: {exc}",
                    },
                ) from exc
        else:
            with BrainstormService._in_memory_lock:
                rec = BrainstormService._in_memory_receipts.get(scoped_key)
                if rec is not None:
                    if rec.get("lease_token") != lease_token:
                        raise HTTPException(
                            409,
                            detail={
                                "code": "IDEMPOTENCY_LEASE_EXPIRED",
                                "message": "Idempotency lease expired or taken over by another worker",
                            },
                        )
                    rec["status"] = "completed"
                    rec["response"] = response
                    rec["lease_expires_at"] = 0
                BrainstormService._in_memory_condition.notify_all()

    def _fail_receipt(
        self, novel_id: str, scoped_key: str, lease_token: str, error_detail: str | None = None
    ) -> None:
        """Mark a pending receipt as failed and clear lease so subsequent retries can re-attempt."""
        if hasattr(self._repository, "_session_factory"):
            try:
                with session_scope(self._repository._session_factory) as session:
                    n_id = self._repository._novel_id(novel_id)
                    rec = session.scalar(
                        select(AnalysisRunRecord)
                        .where(
                            AnalysisRunRecord.idempotency_key == scoped_key,
                            AnalysisRunRecord.tenant_id == self._repository._tenant_id,
                            AnalysisRunRecord.novel_id == n_id,
                        )
                        .with_for_update()
                    )
                    if rec is not None:
                        audit = dict(rec.entity_candidate_audit or {})
                        if audit.get("lease_token") == lease_token:
                            rec.status = "failed"
                            audit["error"] = error_detail
                            audit["lease_expires_at"] = 0  # Expire lease immediately so retries take over instantly
                            rec.entity_candidate_audit = audit
                            session.flush()
            except Exception as exc:
                logger.warning("Failed to record failure status for receipt: %s", exc)
        else:
            with BrainstormService._in_memory_lock:
                rec = BrainstormService._in_memory_receipts.get(scoped_key)
                if rec is not None and rec.get("lease_token") == lease_token:
                    rec["status"] = "failed"
                    rec["error"] = error_detail
                    rec["lease_expires_at"] = 0
                BrainstormService._in_memory_condition.notify_all()

    def _await_receipt(
        self, novel_id: str, scoped_key: str, timeout_seconds: float = 10.0
    ) -> dict[str, Any] | None:
        """Wait for an in-flight single-flight concurrent receipt to complete or expire."""
        deadline = time.time() + timeout_seconds
        if hasattr(self._repository, "_session_factory"):
            while time.time() < deadline:
                try:
                    r = self._get_receipt(novel_id, scoped_key)
                    if r is not None and r["status"] != "pending":
                        return r
                    if r is not None and r["status"] == "pending" and time.time() > r.get("lease_expires_at", 0):
                        return r
                except Exception:
                    pass
                time.sleep(0.1)
            return None
        else:
            with BrainstormService._in_memory_condition:
                while time.time() < deadline:
                    r = BrainstormService._in_memory_receipts.get(scoped_key)
                    if r is not None and r["status"] != "pending":
                        return dict(r)
                    if r is not None and r["status"] == "pending" and time.time() > r.get("lease_expires_at", 0):
                        return dict(r)
                    BrainstormService._in_memory_condition.wait(timeout=0.2)
            return None

    @staticmethod
    def _is_quota_error(exc: Exception) -> bool:
        msg = str(exc).lower()
        return any(term in msg for term in ("429", "quota", "rate limit", "resource_exhausted", "resourceexhausted"))

    def brainstorm(
        self,
        brain_id: str,
        request: BrainstormRequest,
        *,
        tenant_id: str,
        actor_id: str | None = None,
    ) -> BrainstormResponse:
        self._scope(tenant_id)

        # 0. Enforce validated author identity
        if not actor_id:
            raise HTTPException(
                401,
                detail={"code": "BRAINSTORM_IDENTITY_REQUIRED", "message": "Author identity is required"},
            )

        # 1. Enforce author novel ownership before any context retrieval or provider dispatch
        self._verify_novel_ownership(brain_id, actor_id)

        # 2. Idempotency Key & Input Fingerprint Computation
        # Fingerprint strictly binds tenant, author, novel, key, payload, and expected versions
        scoped_idempotency_key: str | None = None
        input_hash: str | None = None
        lease_token: str | None = None
        if request.idempotency_key:
            scoped_idempotency_key = (
                f"brainstorm:{tenant_id}:{actor_id}:{brain_id}:{request.idempotency_key}"[:255]
            )
            canonical_input = {
                "tenant_id": tenant_id,
                "author_id": actor_id,
                "novel_id": brain_id,
                "idempotency_key": request.idempotency_key,
                "target": request.target,
                "instruction": request.instruction,
                "current_chapter": request.current_chapter,
                "target_chapter": request.target_chapter,
                "expected_brain_version": request.expected_brain_version,
                "expected_plan_version": request.expected_plan_version,
                "private_notes": request.private_notes,
                "private_author_notes": request.private_author_notes,
            }
            input_hash = hashlib.sha256(
                json.dumps(canonical_input, sort_keys=True, ensure_ascii=False).encode("utf-8")
            ).hexdigest()

            # EXACT REPLAY CHECK: Check previous receipt BEFORE CAS checks
            # A legitimate exact retry returns the original result even after intervening Brain/Plan updates.
            receipt = self._get_receipt(brain_id, scoped_idempotency_key)
            if receipt is not None:
                if receipt["input_hash"] != input_hash:
                    raise HTTPException(
                        409,
                        detail={
                            "code": "IDEMPOTENCY_CONFLICT",
                            "message": f"Idempotency key {request.idempotency_key} reused with conflicting payload",
                        },
                    )
                if receipt["status"] == "completed" and receipt.get("response"):
                    return BrainstormResponse.model_validate(receipt["response"])
                elif receipt["status"] == "pending" and time.time() <= receipt.get("lease_expires_at", 0):
                    # In-flight concurrent request with identical payload
                    completed_r = self._await_receipt(brain_id, scoped_idempotency_key, timeout_seconds=10.0)
                    if completed_r and completed_r["status"] == "completed" and completed_r.get("response"):
                        return BrainstormResponse.model_validate(completed_r["response"])
                # If receipt status is 'failed' or pending lease expired, fall through to CAS and takeover!

        # 3. Fetch Story Brain (read-only)
        try:
            try:
                brain = self._repository.get_story_brain(brain_id, read_only=True)
            except TypeError:
                brain = self._repository.get_story_brain(brain_id)
        except KeyError:
            raise HTTPException(
                404, detail={"code": "BRAIN_NOT_FOUND", "message": f"Story brain {brain_id} not found"}
            )

        # 4. CAS verification on Story Brain
        brain_version = int(brain.metadata.get("brain_version", "1"))
        if request.expected_brain_version is not None and request.expected_brain_version != brain_version:
            raise HTTPException(
                409,
                detail={
                    "code": "BRAIN_VERSION_CONFLICT",
                    "message": f"Expected brain version {request.expected_brain_version} but found {brain_version}",
                },
            )

        # 5. CAS verification on Story Plan (Fail-Closed)
        plan_version, max_plan_chapter = self._get_active_plan_info(
            brain_id, actor_id, request.expected_plan_version
        )

        # 6. Single-Flight Idempotency Reservation / Takeover
        if scoped_idempotency_key and input_hash:
            try:
                reserved, lease_token, completed_response = self._reserve_or_takeover_receipt(
                    brain, brain_id, scoped_idempotency_key, input_hash, actor_id
                )
                if not reserved:
                    if completed_response:
                        return BrainstormResponse.model_validate(completed_response)
                    # Active worker is running; await it
                    completed_r = self._await_receipt(brain_id, scoped_idempotency_key, timeout_seconds=10.0)
                    if completed_r and completed_r["status"] == "completed" and completed_r.get("response"):
                        return BrainstormResponse.model_validate(completed_r["response"])
                    # Worker failed or lease expired; attempt takeover
                    reserved, lease_token, completed_response = self._reserve_or_takeover_receipt(
                        brain, brain_id, scoped_idempotency_key, input_hash, actor_id
                    )
                    if not reserved:
                        if completed_response:
                            return BrainstormResponse.model_validate(completed_response)
                        raise HTTPException(
                            409,
                            detail={
                                "code": "IDEMPOTENCY_IN_FLIGHT_CONFLICT",
                                "message": "Concurrent request in-flight failed or timed out",
                            },
                        )
                if not lease_token:
                    raise HTTPException(
                        503,
                        detail={
                            "code": "IDEMPOTENCY_STORE_UNAVAILABLE",
                            "message": "Failed to acquire valid lease token for reservation",
                        },
                    )
            except HTTPException:
                raise
            except Exception as exc:
                logger.error("DB exception during reservation: %s", exc)
                raise HTTPException(
                    503,
                    detail={
                        "code": "IDEMPOTENCY_STORE_UNAVAILABLE",
                        "message": f"Idempotency reservation store unavailable: {exc}",
                    },
                ) from exc

        try:
            # 7. Grounding in Story Brain: approved entities
            approved_entity_ids: set[str] = set()
            known_entities: list[dict[str, Any]] = []
            for ent in brain.entities:
                if ent.entity_id:
                    approved_entity_ids.add(str(ent.entity_id))
                    known_entities.append(
                        {
                            "entity_id": str(ent.entity_id),
                            "name": ent.name,
                            "entity_type": getattr(ent, "entity_type", "character"),
                        }
                    )

            # 8. Grounding in World Rules: BSA-01 Verified Effective Canon Lineage
            raw_facts: list[dict[str, Any]] = []
            for f in getattr(brain, "facts", ()):
                if isinstance(f, dict):
                    raw_facts.append(dict(f))
                elif hasattr(f, "__dict__"):
                    raw_facts.append(dict(f.__dict__))
                else:
                    raw_facts.append(
                        {
                            "fact_id": getattr(f, "fact_id", None),
                            "fact_type": getattr(f, "fact_type", None),
                            "fact_key": getattr(f, "fact_key", None),
                            "fact_value": getattr(f, "fact_value", None),
                            "confirmation_status": getattr(f, "confirmation_status", "confirmed"),
                            "supersedes_id": getattr(f, "supersedes_id", None),
                            "is_retired": getattr(f, "is_retired", False),
                            "is_locked": getattr(f, "is_locked", False),
                            "tenant_id": getattr(f, "tenant_id", None),
                            "novel_id": getattr(f, "novel_id", None),
                            "story_brain_id": getattr(f, "story_brain_id", None),
                        }
                    )

            verified_edges = set(tuple(e) for e in brain.metadata.get("verified_amendment_edges", ()))

            try:
                effective_facts = resolve_effective_facts(
                    raw_facts,
                    tenant_id=str(tenant_id) if tenant_id else None,
                    novel_id=str(brain_id) if brain_id else None,
                    story_brain_id=str(brain.metadata.get("brain_id")) if brain.metadata.get("brain_id") else None,
                    expected_setup_actor=str(actor_id) if actor_id else None,
                    verified_amendment_edges=verified_edges,
                )
            except (WorldRuleLineageError, ProjectionError) as exc:
                # Fails closed on invalid receipt / unverified successor BEFORE ANY PROVIDER DISPATCH!
                err_code = getattr(exc, "code", "WORLD_RULE_LINEAGE_INVALID")
                raise HTTPException(
                    422,
                    detail={
                        "code": err_code,
                        "message": f"World Rule lineage resolution failed: {exc}",
                    },
                ) from exc

            confirmed_rules: list[str] = []
            for fact in effective_facts:
                if fact.get("fact_type") == "world_rule":
                    val = fact.get("fact_value")
                    if val:
                        if isinstance(val, str):
                            confirmed_rules.append(val)
                        elif isinstance(val, dict):
                            confirmed_rules.append(
                                val.get("content") or val.get("rule") or val.get("text") or str(val)
                            )
                        else:
                            confirmed_rules.append(str(val))

            curr_ch = request.current_chapter or max_plan_chapter or 1
            target_ch = request.target_chapter or (curr_ch + 1)

            # 9. Guard provider availability
            if self._llm_service is None:
                raise HTTPException(
                    503,
                    detail={
                        "code": "BRAINSTORM_PROVIDER_UNAVAILABLE",
                        "message": "LLM service is not configured or unavailable",
                    },
                )

            # 10. Call provider abstraction (strictly exclude private notes from prompt)
            try:
                if hasattr(self._llm_service, "suggest_brainstorm"):
                    raw_output = self._llm_service.suggest_brainstorm(
                        instruction=request.instruction,
                        known_entities=known_entities,
                        world_rules=confirmed_rules,
                        current_chapter=curr_ch,
                        target_chapter=target_ch,
                        target=request.target,
                    )
                elif hasattr(self._llm_service, "_call_structured"):
                    system_prompt = (
                        "You are an expert creative writing assistant and novel architect. "
                        "Generate structured brainstorm suggestions based on confirmed world rules and known characters.\n"
                        "Return ONLY valid JSON matching this schema:\n"
                        '{"world_rules": [...], "characters": [...], "future_events": [...]}\n'
                        "Do NOT fabricate entity UUIDs."
                    )
                    user_prompt = json.dumps(
                        {
                            "instruction": request.instruction,
                            "known_entities": known_entities,
                            "world_rules": confirmed_rules,
                            "current_chapter": curr_ch,
                            "target_chapter": target_ch,
                            "target": request.target,
                        }
                    )
                    raw_str = self._llm_service._call_structured(
                        operation="brainstorm_suggestions",
                        system_prompt=system_prompt,
                        user_prompt=user_prompt,
                    )
                    raw_output = json.loads(raw_str)
                else:
                    raise HTTPException(503, detail={"code": "BRAINSTORM_PROVIDER_UNAVAILABLE"})
            except Exception as exc:
                if self._is_quota_error(exc):
                    raise HTTPException(
                        429,
                        detail={
                            "code": "PROVIDER_QUOTA_EXHAUSTED",
                            "message": "LLM provider quota or rate limit exceeded. Please retry later.",
                            "retry_after": 60,
                        },
                    )
                if isinstance(exc, HTTPException):
                    raise
                logger.warning("Brainstorm provider invocation failed: %s", exc)
                raise HTTPException(
                    502,
                    detail={
                        "code": "BRAINSTORM_PROVIDER_ERROR",
                        "message": "LLM provider failed to generate brainstorming suggestions",
                    },
                )

            # 11. Strict, bounded validation envelope on provider output (BSA-04)
            if not isinstance(raw_output, dict):
                raise HTTPException(
                    502,
                    detail={
                        "code": "BRAINSTORM_PROVIDER_ERROR",
                        "message": "Provider returned invalid non-dict output",
                    },
                )

            # Server-side target enforcement: isolate requested categories
            if request.target == "world_rules":
                raw_rules = raw_output.get("world_rules") or []
                raw_chars: list[Any] = []
                raw_events: list[Any] = []
            elif request.target == "characters":
                raw_rules = []
                raw_chars = raw_output.get("characters") or raw_output.get("character_seeds") or []
                raw_events = []
            elif request.target == "future_events":
                raw_rules = []
                raw_chars = []
                raw_events = raw_output.get("future_events") or raw_output.get("events") or []
            else:  # "all"
                raw_rules = raw_output.get("world_rules") or []
                raw_chars = raw_output.get("characters") or raw_output.get("character_seeds") or []
                raw_events = raw_output.get("future_events") or raw_output.get("events") or []

            if not isinstance(raw_rules, list) or not isinstance(raw_chars, list) or not isinstance(raw_events, list):
                raise HTTPException(
                    502,
                    detail={
                        "code": "BRAINSTORM_PROVIDER_ERROR",
                        "message": "Malformed category payload: expected lists",
                    },
                )

            if not raw_rules and not raw_chars and not raw_events:
                raise HTTPException(
                    502,
                    detail={
                        "code": "BRAINSTORM_EMPTY_SUGGESTIONS",
                        "message": "Provider returned empty suggestions",
                    },
                )

            if (
                len(raw_rules) > MAX_SUGGESTIONS_PER_CATEGORY
                or len(raw_chars) > MAX_SUGGESTIONS_PER_CATEGORY
                or len(raw_events) > MAX_SUGGESTIONS_PER_CATEGORY
            ):
                raise HTTPException(
                    502,
                    detail={
                        "code": "BRAINSTORM_PROVIDER_ERROR",
                        "message": f"Provider exceeded maximum allowed suggestions ({MAX_SUGGESTIONS_PER_CATEGORY} per category)",
                    },
                )

            # Parse and bound World Rules
            world_rules: list[ProposedWorldRule] = []
            for r in raw_rules:
                if not isinstance(r, dict):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed world rule item: expected dictionary",
                        },
                    )
                raw_text_val = r.get("text") or r.get("fact_value") or r.get("rule_content")
                if raw_text_val is None or not isinstance(raw_text_val, str):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed world rule: text must be a string",
                        },
                    )
                text_val = raw_text_val.strip()
                if not text_val:
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed world rule: text cannot be empty",
                        },
                    )
                text_val = text_val[:MAX_TEXT_LENGTH]
                rule_id = str(uuid.uuid4())
                raw_fact_key = r.get("fact_key")
                if raw_fact_key is not None and not isinstance(raw_fact_key, str):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed world rule: fact_key must be a string",
                        },
                    )
                fact_key = raw_fact_key or f"world_rule_{hashlib.sha256(text_val.encode('utf-8')).hexdigest()[:12]}"
                fact_key = fact_key[:MAX_SHORT_TEXT_LENGTH]
                raw_cat = r.get("category")
                if raw_cat is not None and not isinstance(raw_cat, str):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed world rule: category must be a string",
                        },
                    )
                cat = (raw_cat or "general")[:MAX_SHORT_TEXT_LENGTH]
                try:
                    world_rules.append(
                        ProposedWorldRule(
                            rule_id=rule_id,
                            fact_key=fact_key,
                            text=text_val,
                            category=cat,
                            origin="model_proposed",
                            status="model_proposed",
                            is_canon=False,
                            is_historical=False,
                        )
                    )
                except ValidationError as ve:
                    raise HTTPException(
                        502,
                        detail={"code": "BRAINSTORM_PROVIDER_ERROR", "message": f"World rule validation failed: {ve}"},
                    ) from ve

            # Parse and bound Characters
            characters: list[ProposedCharacter] = []
            for c in raw_chars:
                if not isinstance(c, dict):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed character item: expected dictionary",
                        },
                    )
                raw_name = c.get("name") or c.get("canonical_name")
                if raw_name is None or not isinstance(raw_name, str):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed character: name must be a string",
                        },
                    )
                name = raw_name.strip()
                if not name:
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed character: name cannot be empty",
                        },
                    )
                name = name[:MAX_SHORT_TEXT_LENGTH]
                char_id = str(uuid.uuid4())

                raw_role = c.get("role")
                if raw_role is not None and not isinstance(raw_role, str):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed character: role must be a string",
                        },
                    )
                role = (raw_role or "other")[:MAX_SHORT_TEXT_LENGTH]

                raw_desc = c.get("description")
                if raw_desc is not None and not isinstance(raw_desc, str):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed character: description must be a string",
                        },
                    )
                desc = (raw_desc or "")[:MAX_TEXT_LENGTH]

                raw_arch = c.get("archetype")
                if raw_arch is not None and not isinstance(raw_arch, str):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed character: archetype must be a string",
                        },
                    )
                arch = (raw_arch or "")[:MAX_SHORT_TEXT_LENGTH]

                raw_aliases = c.get("aliases")
                aliases: list[str] = []
                if raw_aliases is not None:
                    if not isinstance(raw_aliases, list):
                        raise HTTPException(
                            502,
                            detail={
                                "code": "BRAINSTORM_PROVIDER_ERROR",
                                "message": "Malformed character: aliases must be a list of strings",
                            },
                        )
                    for a in raw_aliases:
                        if not isinstance(a, str):
                            raise HTTPException(
                                502,
                                detail={
                                    "code": "BRAINSTORM_PROVIDER_ERROR",
                                    "message": "Malformed character: alias items must be strings",
                                },
                            )
                        aliases.append(a[:MAX_SHORT_TEXT_LENGTH])

                try:
                    characters.append(
                        ProposedCharacter(
                            character_id=char_id,
                            name=name,
                            canonical_name=name,
                            entity_type="character",
                            role=role,
                            description=desc,
                            archetype=arch,
                            aliases=aliases,
                            origin="model_proposed",
                            status="model_proposed",
                            is_canon=False,
                            is_historical=False,
                        )
                    )
                except ValidationError as ve:
                    raise HTTPException(
                        502,
                        detail={"code": "BRAINSTORM_PROVIDER_ERROR", "message": f"Character validation failed: {ve}"},
                    ) from ve

            # Parse and bound Future Events
            future_events: list[ProposedFutureEvent] = []
            for e in raw_events:
                if not isinstance(e, dict):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed future event item: expected dictionary",
                        },
                    )
                raw_title = e.get("title")
                if raw_title is None or not isinstance(raw_title, str):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed future event: title must be a string",
                        },
                    )
                title = raw_title.strip()
                if not title:
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed future event: title cannot be empty",
                        },
                    )
                title = title[:MAX_SHORT_TEXT_LENGTH]
                ev_id = str(uuid.uuid4())

                raw_ch = e.get("target_chapter")
                if raw_ch is None:
                    ev_target_ch = target_ch
                else:
                    if isinstance(raw_ch, bool) or not isinstance(raw_ch, int):
                        raise HTTPException(
                            502,
                            detail={
                                "code": "BRAINSTORM_PROVIDER_ERROR",
                                "message": f"Malformed target_chapter in future event: expected integer, got {type(raw_ch).__name__}",
                            },
                        )
                    ev_target_ch = raw_ch

                if ev_target_ch < 1 or ev_target_ch > 10000:
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": f"Target chapter out of valid range (1-10000): {ev_target_ch}",
                        },
                    )

                raw_desc = e.get("description") or e.get("text")
                if raw_desc is not None and not isinstance(raw_desc, str):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed future event: description must be a string",
                        },
                    )
                desc = (raw_desc or "")[:MAX_TEXT_LENGTH]

                raw_ending = e.get("ending")
                if raw_ending is not None and not isinstance(raw_ending, bool):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed future event: ending must be a boolean",
                        },
                    )
                ending = bool(raw_ending) if raw_ending is not None else False

                raw_min_words = e.get("min_words")
                if raw_min_words is not None and (isinstance(raw_min_words, bool) or not isinstance(raw_min_words, int)):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed future event: min_words must be an integer",
                        },
                    )
                min_words_int = int(raw_min_words) if raw_min_words is not None else 1500

                raw_participants = e.get("participants", [])
                if not isinstance(raw_participants, list):
                    raise HTTPException(
                        502,
                        detail={
                            "code": "BRAINSTORM_PROVIDER_ERROR",
                            "message": "Malformed participants: expected list",
                        },
                    )

                participants: list[BrainstormParticipant] = []
                for p in raw_participants:
                    if not isinstance(p, dict):
                        raise HTTPException(
                            502,
                            detail={
                                "code": "BRAINSTORM_PROVIDER_ERROR",
                                "message": "Malformed participant: expected dict",
                            },
                        )
                    ent_id = p.get("entity_id")
                    hint = p.get("name_hint")

                    if ent_id is not None and not isinstance(ent_id, str):
                        raise HTTPException(
                            502,
                            detail={
                                "code": "BRAINSTORM_PROVIDER_ERROR",
                                "message": "Malformed participant: entity_id must be a string",
                            },
                        )
                    if hint is not None and not isinstance(hint, str):
                        raise HTTPException(
                            502,
                            detail={
                                "code": "BRAINSTORM_PROVIDER_ERROR",
                                "message": "Malformed participant: name_hint must be a string",
                            },
                        )

                    if ent_id and hint:
                        raise HTTPException(
                            422,
                            detail={
                                "code": "INVALID_PARTICIPANT_PAYLOAD",
                                "message": "Choose exact approved entity_id or unresolved name_hint, not both",
                            },
                        )
                    if not ent_id and not hint:
                        raise HTTPException(
                            422,
                            detail={
                                "code": "INVALID_PARTICIPANT_PAYLOAD",
                                "message": "Participant must have either entity_id or name_hint",
                            },
                        )

                    if ent_id:
                        ent_id_str = ent_id.strip()
                        try:
                            uuid.UUID(ent_id_str)
                        except (ValueError, TypeError):
                            raise HTTPException(
                                422,
                                detail={
                                    "code": "BRAINSTORM_FABRICATED_IDENTITY",
                                    "message": f"Participant entity_id '{ent_id}' is not a valid UUID",
                                    "fabricated_id": str(ent_id),
                                },
                            )
                        # Strict Grounding Check: Reject fabricated entity IDs
                        if ent_id_str not in approved_entity_ids:
                            raise HTTPException(
                                422,
                                detail={
                                    "code": "BRAINSTORM_FABRICATED_IDENTITY",
                                    "message": f"Fabricated participant entity_id '{ent_id}' is not in approved story entities",
                                    "fabricated_id": ent_id_str,
                                },
                            )
                        participants.append(BrainstormParticipant(entity_id=ent_id_str, name_hint=None))
                    else:
                        hint_str = hint.strip()[:MAX_SHORT_TEXT_LENGTH]
                        participants.append(BrainstormParticipant(entity_id=None, name_hint=hint_str))

                try:
                    future_events.append(
                        ProposedFutureEvent(
                            event_id=ev_id,
                            target_chapter=ev_target_ch,
                            title=title,
                            description=desc,
                            text=desc,
                            ending=ending,
                            min_words=min_words_int,
                            participants=participants,
                            origin="model_proposed",
                            status="model_proposed",
                            is_canon=False,
                            is_historical=False,
                        )
                    )
                except ValidationError as ve:
                    raise HTTPException(
                        502,
                        detail={"code": "BRAINSTORM_PROVIDER_ERROR", "message": f"Future event validation failed: {ve}"},
                    ) from ve

            # 12. Assemble Provenance
            provenance = BrainstormProvenance(
                contract_version="brainstorm-v1",
                provider=getattr(self._llm_service, "provider", "fake"),
                model=getattr(self._llm_service, "model", "fake-model"),
                status="model_proposed",
                grounding_rules_count=len(confirmed_rules),
                grounding_entities_count=len(known_entities),
                timestamp=datetime.now(timezone.utc).isoformat(),
            )

            response = BrainstormResponse(
                contract_version="brainstorm-v1",
                novel_id=brain_id,
                story_brain_id=brain_id,
                brain_version=brain_version,
                plan_version=plan_version,
                world_rules=world_rules,
                characters=characters,
                character_seeds=characters,
                future_events=future_events,
                events=future_events,
                provenance=provenance,
            )

            # 13. Complete durable idempotency receipt
            if scoped_idempotency_key and lease_token:
                self._complete_receipt(brain_id, scoped_idempotency_key, lease_token, response.model_dump())

            return response
        except Exception as exc:
            # Mark reservation as failed on any error so future retries can proceed
            if scoped_idempotency_key and lease_token:
                self._fail_receipt(brain_id, scoped_idempotency_key, lease_token, error_detail=str(exc))
            raise
