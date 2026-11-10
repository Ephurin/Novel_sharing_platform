"""Application service for structured AI brainstorming suggestions.

Generates structured proposals for World Rules, Character Seeds, and Future
Chapter Events. All proposals carry status `model_proposed`, strictly separated
from Canon / historical records. Suggestions are grounded in approved Story
Brain memory, protected against hallucinated identities, quota-aware, and CAS-guarded.
"""
from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

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

logger = logging.getLogger("brainstorm-service")


class BrainstormService:
    """Orchestrates structured brainstorming suggestions without mutating Canon."""

    def __init__(self, repository: Any, llm_service: Any = None) -> None:
        self._repository = repository
        self._llm_service = llm_service
        self._idempotency_cache: dict[str, dict[str, Any]] = {}

    def _scope(self, tenant_id: str) -> None:
        configured = getattr(self._repository, "_tenant_id", None)
        if configured is not None and str(configured) != str(tenant_id):
            raise HTTPException(403, detail={"code": "TENANT_SCOPE_MISMATCH"})

    def _get_active_plan_info(self, novel_id: str, actor_id: str | None) -> tuple[int | None, int]:
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
        except Exception:
            return None, 1

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

        # 1. Fetch Story Brain (read-only if supported)
        try:
            try:
                brain = self._repository.get_story_brain(brain_id, read_only=True)
            except TypeError:
                brain = self._repository.get_story_brain(brain_id)
        except KeyError:
            raise HTTPException(404, detail={"code": "BRAIN_NOT_FOUND", "message": f"Story brain {brain_id} not found"})

        # 2. CAS verification on Story Brain
        brain_version = int(brain.metadata.get("brain_version", "1"))
        if request.expected_brain_version is not None and request.expected_brain_version != brain_version:
            raise HTTPException(
                409,
                detail={
                    "code": "BRAIN_VERSION_CONFLICT",
                    "message": f"Expected brain version {request.expected_brain_version} but found {brain_version}",
                },
            )

        # 3. CAS verification on active Story Plan
        plan_version, max_plan_chapter = self._get_active_plan_info(brain_id, actor_id)
        if (
            request.expected_plan_version is not None
            and plan_version is not None
            and request.expected_plan_version != plan_version
        ):
            raise HTTPException(
                409,
                detail={
                    "code": "PLAN_VERSION_CONFLICT",
                    "message": f"Expected plan version {request.expected_plan_version} but found {plan_version}",
                },
            )

        # 4. Idempotency replay / conflict check
        # Note: private_notes are included in canonical hash to prevent replay collisions with modified notes
        canonical_input = {
            "novel_id": brain_id,
            "target": request.target,
            "instruction": request.instruction,
            "current_chapter": request.current_chapter,
            "target_chapter": request.target_chapter,
            "private_notes": request.private_notes,
            "private_author_notes": request.private_author_notes,
        }
        input_hash = hashlib.sha256(
            json.dumps(canonical_input, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()

        if request.idempotency_key:
            cache_key = f"{tenant_id}:{brain_id}:{request.idempotency_key}"
            if cache_key in self._idempotency_cache:
                cached_entry = self._idempotency_cache[cache_key]
                if cached_entry["input_hash"] != input_hash:
                    raise HTTPException(
                        409,
                        detail={
                            "code": "IDEMPOTENCY_CONFLICT",
                            "message": f"Idempotency key {request.idempotency_key} reused with conflicting payload",
                        },
                    )
                return cached_entry["response"]

        # 5. Guard provider availability
        if self._llm_service is None:
            raise HTTPException(
                503,
                detail={
                    "code": "BRAINSTORM_PROVIDER_UNAVAILABLE",
                    "message": "LLM service is not configured or unavailable",
                },
            )

        # 6. Extract grounding context from Story Brain
        approved_entity_ids: set[str] = set()
        known_entities: list[dict[str, Any]] = []
        for ent in brain.entities:
            if ent.entity_id:
                approved_entity_ids.add(ent.entity_id)
                known_entities.append(
                    {
                        "entity_id": ent.entity_id,
                        "name": ent.name,
                        "entity_type": getattr(ent, "entity_type", "character"),
                    }
                )

        confirmed_rules: list[str] = []
        if hasattr(brain, "facts"):
            for fact in brain.facts:
                if isinstance(fact, dict) and fact.get("fact_type") == "world_rule":
                    val = fact.get("fact_value")
                    if val:
                        confirmed_rules.append(str(val))
                elif hasattr(fact, "fact_type") and fact.fact_type == "world_rule":
                    val = getattr(fact, "fact_value", None)
                    if val:
                        confirmed_rules.append(str(val))

        curr_ch = request.current_chapter or max_plan_chapter or 1
        target_ch = request.target_chapter or (curr_ch + 1)

        # 7. Call provider abstraction (strictly exclude private_notes from prompt)
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

        if not isinstance(raw_output, dict):
            raise HTTPException(
                502,
                detail={
                    "code": "BRAINSTORM_OUTPUT_INVALID",
                    "message": "Provider returned invalid non-dict output",
                },
            )

        # 8. Parse and validate suggestions
        raw_rules = raw_output.get("world_rules") or []
        raw_chars = raw_output.get("characters") or raw_output.get("character_seeds") or []
        raw_events = raw_output.get("future_events") or raw_output.get("events") or []

        if not raw_rules and not raw_chars and not raw_events:
            raise HTTPException(
                502,
                detail={
                    "code": "BRAINSTORM_EMPTY_SUGGESTIONS",
                    "message": "Provider returned empty suggestions",
                },
            )

        # World Rules
        world_rules: list[ProposedWorldRule] = []
        for r in raw_rules:
            text = (r.get("text") or r.get("fact_value") or "").strip()
            if not text:
                continue
            rule_id = str(uuid.uuid4())
            fact_key = r.get("fact_key") or f"world_rule_{hashlib.sha256(text.encode('utf-8')).hexdigest()[:12]}"
            world_rules.append(
                ProposedWorldRule(
                    rule_id=rule_id,
                    fact_key=fact_key,
                    text=text,
                    category=r.get("category", "general"),
                    origin="model_proposed",
                    status="model_proposed",
                    is_canon=False,
                    is_historical=False,
                )
            )

        # Characters
        characters: list[ProposedCharacter] = []
        for c in raw_chars:
            name = (c.get("name") or c.get("canonical_name") or "").strip()
            if not name:
                continue
            char_id = str(uuid.uuid4())
            characters.append(
                ProposedCharacter(
                    character_id=char_id,
                    name=name,
                    canonical_name=name,
                    entity_type="character",
                    role=c.get("role", "other"),
                    description=c.get("description", ""),
                    archetype=c.get("archetype", ""),
                    aliases=c.get("aliases", []),
                    origin="model_proposed",
                    status="model_proposed",
                    is_canon=False,
                    is_historical=False,
                )
            )

        # Future Events with Participant & Hallucination Guarding
        future_events: list[ProposedFutureEvent] = []
        for e in raw_events:
            title = (e.get("title") or "").strip()
            if not title:
                continue
            ev_id = str(uuid.uuid4())
            ev_target_ch = int(e.get("target_chapter") or target_ch)
            if ev_target_ch < 1:
                raise HTTPException(
                    422,
                    detail={"code": "INVALID_TARGET_CHAPTER", "message": "Target chapter must be positive"},
                )

            desc = e.get("description") or e.get("text") or ""
            participants: list[BrainstormParticipant] = []

            for p in e.get("participants", []):
                ent_id = p.get("entity_id")
                hint = p.get("name_hint")

                if ent_id and hint:
                    raise HTTPException(
                        422,
                        detail={
                            "code": "INVALID_PARTICIPANT_PAYLOAD",
                            "message": "Choose exact approved entity_id or unresolved name_hint",
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
                    # Strict Grounding Check: Reject fabricated entity IDs
                    if ent_id not in approved_entity_ids:
                        raise HTTPException(
                            422,
                            detail={
                                "code": "BRAINSTORM_FABRICATED_IDENTITY",
                                "message": f"Fabricated participant entity_id '{ent_id}' is not in approved story entities",
                                "fabricated_id": ent_id,
                            },
                        )
                    participants.append(BrainstormParticipant(entity_id=ent_id, name_hint=None))
                else:
                    participants.append(BrainstormParticipant(entity_id=None, name_hint=str(hint).strip()))

            future_events.append(
                ProposedFutureEvent(
                    event_id=ev_id,
                    target_chapter=ev_target_ch,
                    title=title,
                    description=desc,
                    text=desc,
                    ending=bool(e.get("ending", False)),
                    min_words=int(e.get("min_words", 1500)),
                    participants=participants,
                    origin="model_proposed",
                    status="model_proposed",
                    is_canon=False,
                    is_historical=False,
                )
            )

        # 9. Assemble Provenance
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

        # Cache for idempotency if key was provided
        if request.idempotency_key:
            cache_key = f"{tenant_id}:{brain_id}:{request.idempotency_key}"
            self._idempotency_cache[cache_key] = {
                "input_hash": input_hash,
                "response": response,
            }

        return response
