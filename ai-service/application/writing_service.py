from __future__ import annotations

import hashlib
import logging
import re
import uuid
from dataclasses import replace
from typing import Any

import json
from application.context_budget import ContextBudgetPacker
from application.context_routing import ContextBudgetRouter
from application.context_scope import BalancedRelevanceScopeBuilder
from application.hybrid_ranker import HYBRID_RANKING_VERSION
from application.ports import ContentHashMismatchError, RevisionContentProvider
from domain.errors import (
    ContextRoutingUnresolvedError,
    IdempotencyConflictError,
    NarrativeRepositoryError,
    OptimisticLockError,
    SelectionOutOfBoundsError,
    ValidationFailedError,
    WritingGenerationNotFoundError,
)
from domain.models import (
    ValidationResult,
    WritingContextPackage,
    WritingGenerationJob,
    WritingPatch,
)
from domain.repositories import NarrativeRepository

logger = logging.getLogger(__name__)


class WritingService:
    """Coordinates context preparation, LLM draft generation, and deterministic validations."""

    def __init__(
        self,
        repository: NarrativeRepository,
        llm_service: Any,
        revision_provider: RevisionContentProvider | None = None,
        semantic_retriever: Any | None = None,
        context_packer: ContextBudgetPacker | None = None,
        context_scope_builder: BalancedRelevanceScopeBuilder | None = None,
        context_budget_router: ContextBudgetRouter | None = None,
        context_routing_policy: str = "legacy-v1",
    ) -> None:
        if context_routing_policy not in {"legacy-v1", "balanced-scope-v1"}:
            raise ValueError(f"Unsupported context routing policy: {context_routing_policy}")
        self._repository = repository
        self._llm_service = llm_service
        self._revision_provider = revision_provider
        self._semantic_retriever = semantic_retriever
        self._context_packer = context_packer or ContextBudgetPacker()
        self._context_scope_builder = (
            context_scope_builder or BalancedRelevanceScopeBuilder()
        )
        self._context_budget_router = (
            context_budget_router or ContextBudgetRouter(self._context_packer)
        )
        self._context_routing_policy = context_routing_policy

    def preview_context(
        self,
        *,
        tenant_id: str,
        story_id: str,
        chapter_number: int | None = None,
        character_name: str | None = None,
        limit_recent_events: int = 20,
        token_budget: int | None = None,
        semantic_query: str | None = None,
        semantic_limit: int | None = None,
    ) -> WritingContextPackage:
        """Fetch and structure narrative context for writing assistance."""
        package = self._repository.get_structured_context(
            story_id=story_id,
            chapter_number=chapter_number,
            character_name=character_name,
            limit_recent_events=limit_recent_events,
            token_budget=None,
            enforce_token_budget=False,
        )

        retrieval_result = None
        if self._semantic_retriever is not None and semantic_query and semantic_query.strip():
            retrieval_result = self._semantic_retriever.retrieve(
                story_id,
                query_text=semantic_query,
                chapter_number=chapter_number,
                limit=semantic_limit,
                tenant_id=tenant_id,
            )
            semantic_memories = tuple(
                self._semantic_match_payload(match) for match in retrieval_result.matches
            )
            context_summary = dict(package.context_summary)
            context_summary["semantic_retrieval_status"] = [retrieval_result.status]
            context_summary["semantic_embedding_version"] = [
                retrieval_result.embedding_version
            ]
            context_summary["semantic_ranking_version"] = [
                retrieval_result.ranking_version
            ]
            context_summary["semantic_memory_ids"] = [
                item["memory_chunk_id"] for item in semantic_memories
            ]
            if retrieval_result.fallback_reason:
                context_summary["semantic_fallback_reason"] = [
                    retrieval_result.fallback_reason
                ]
            package = WritingContextPackage(
                brain_version=package.brain_version,
                entities=package.entities,
                current_states=package.current_states,
                recent_events=package.recent_events,
                semantic_memories=semantic_memories,
                world_rules=package.world_rules,
                author_constraints=package.author_constraints,
                token_budget=package.token_budget,
                context_summary=context_summary,
                planning_context=package.planning_context,
                current_objective=package.current_objective,
            )

        if self._balanced_scope_eligible(
            package=package,
            retrieval_result=retrieval_result,
            chapter_number=chapter_number,
            limit_recent_events=limit_recent_events,
            token_budget=token_budget,
            semantic_limit=semantic_limit,
        ):
            scope = self._context_scope_builder.scope(
                package,
                query_entity_ids=retrieval_result.query_entity_ids,
                recent_participant_entity_ids=package.context_summary.get(
                    "recent_scope_participant_entity_ids", []
                ),
                explicit_character_name=character_name,
            )
            # Conservative fail-open to the existing legacy packer when
            # identity resolution unexpectedly yields an empty relevance
            # scope for a package that actually contains canonical entities.
            # EVAL-01 validated non-empty balanced scopes; do not extrapolate.
            if not package.entities or scope.entity_count_after > 0:
                return self._context_budget_router.route(scope)

        return self._context_packer.pack(
            package,
            maximum=token_budget,
        )

    def _balanced_scope_eligible(
        self,
        *,
        package: WritingContextPackage,
        retrieval_result: Any | None,
        chapter_number: int | None,
        limit_recent_events: int,
        token_budget: int | None,
        semantic_limit: int | None,
    ) -> bool:
        if self._context_routing_policy != "balanced-scope-v1":
            return False
        if retrieval_result is None:
            return False
        if chapter_number is None or token_budget is not None:
            return False
        if limit_recent_events != 20:
            return False
        effective_semantic_limit = (
            semantic_limit
            if semantic_limit is not None
            else getattr(self._semantic_retriever, "default_limit", None)
        )
        if effective_semantic_limit != 8:
            return False
        if retrieval_result.status != "ok":
            return False
        if retrieval_result.ranking_version != HYBRID_RANKING_VERSION:
            return False
        if not bool(retrieval_result.hybrid_signals_resolved):
            return False
        return package.context_summary.get(
            "recent_scope_participant_identity"
        ) == ["normalized-event-participants-v1"]

    def start_generation(
        self,
        *,
        tenant_id: str,
        novel_id: str,
        chapter_id: str,
        revision_id: str,
        content_hash: str,
        operation: str,
        selection: dict[str, int],
        instruction: str,
        constraints: list[str] | tuple[str, ...] = (),
        style: dict[str, Any] | None = None,
        expected_brain_version: int = 1,
        chapter_number: int | None = None,
        actor_id: str | None = None,
        idempotency_key: str = "",
        process_inline: bool = True,
        source_text: str | None = None,
    ) -> WritingGenerationJob:
        if chapter_number is None:
            chapter_number = selection.get("chapter_number")

        # 1. Canonical request hash for idempotency integrity
        canonical_dict = {
            "novel_id": novel_id,
            "chapter_id": chapter_id,
            "revision_id": revision_id,
            "content_hash": content_hash,
            "operation": operation,
            "selection": {
                "start": selection.get("start", selection.get("cursor", 0)),
                "end": selection.get("end", selection.get("cursor", 0)),
                "cursor": selection.get("cursor", 0),
            },
            "instruction": instruction.strip(),
            "expected_brain_version": expected_brain_version,
            "chapter_number": chapter_number,
            "style": style or {},
            "constraints": list(constraints or ()),
        }
        input_hash = hashlib.sha256(json.dumps(canonical_dict, sort_keys=True).encode("utf-8")).hexdigest()

        job_id = (
            str(uuid.uuid5(uuid.NAMESPACE_URL, f"{tenant_id}:{idempotency_key}"))
            if idempotency_key
            else str(uuid.uuid4())
        )

        if idempotency_key:
            try:
                existing = self._repository.get_writing_job(job_id)
                if existing:
                    if existing.input_hash and existing.input_hash != input_hash:
                        raise IdempotencyConflictError(
                            f"Idempotency key '{idempotency_key}' reused with conflicting parameters"
                        )
                    logger.info("Returning existing writing job %s for idempotency key %s", job_id, idempotency_key)
                    return existing
            except (WritingGenerationNotFoundError, KeyError):
                pass

        # 2. Content & Bounds validation via Revision Provider or source_text
        cursor = selection.get("cursor", 0)
        start = selection.get("start", cursor)
        end = selection.get("end", cursor)

        if start < 0 or end < start or cursor < 0:
            raise SelectionOutOfBoundsError(
                f"Negative offsets in selection: start={start}, end={end}, cursor={cursor}"
            )

        base_content_length: int | None = None
        if source_text is not None:
            actual_source_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
            if actual_source_hash != content_hash:
                raise ContentHashMismatchError(revision_id)
            base_content_length = len(source_text)
            if start > base_content_length or end > base_content_length or cursor > base_content_length:
                raise SelectionOutOfBoundsError(
                    f"Selection offsets ({start}, {end}, cursor={cursor}) exceed text length {base_content_length}"
                )
        elif self._revision_provider and not revision_id.startswith("ephemeral:"):
            rev_content = self._revision_provider.get_revision(
                tenant_id=tenant_id,
                novel_id=novel_id,
                chapter_id=chapter_id,
                revision_id=revision_id,
            )
            actual_hash = hashlib.sha256(rev_content.content.encode("utf-8")).hexdigest()
            if actual_hash != content_hash or rev_content.content_hash != content_hash:
                raise ContentHashMismatchError(revision_id)

            base_content_length = len(rev_content.content)  # Python len gives unicode code points
            if start > base_content_length or end > base_content_length or cursor > base_content_length:
                raise SelectionOutOfBoundsError(
                    f"Selection offsets ({start}, {end}, cursor={cursor}) exceed text length {base_content_length}"
                )
        elif revision_id.startswith("ephemeral:"):
            base_content_length = max(cursor, end)

        # 3. Brain Version validation
        brain = self._repository.get_story_brain(novel_id)
        current_version = int(brain.metadata.get("brain_version", "1"))
        if expected_brain_version > 0 and current_version != expected_brain_version:
            raise OptimisticLockError(
                f"Story brain version conflict: expected {expected_brain_version}, found {current_version}"
            )

        selection_with_meta = dict(selection)
        if source_text is not None:
            selection_with_meta["source_text"] = source_text
        if base_content_length is not None:
            selection_with_meta["base_content_length"] = base_content_length
        if chapter_number is not None:
            selection_with_meta["chapter_number"] = chapter_number

        # 4. Create queued job
        job = WritingGenerationJob(

            job_id=job_id,
            novel_id=novel_id,
            chapter_id=chapter_id,
            revision_id=revision_id,
            content_hash=content_hash,
            tenant_id=tenant_id,
            operation=operation,
            selection=selection_with_meta,
            instruction=instruction,
            constraints=tuple(constraints or ()),
            style=dict(style or {}),
            expected_brain_version=expected_brain_version,
            actor_id=actor_id,
            idempotency_key=idempotency_key,
            input_hash=input_hash,
            status="queued",
            stage="queued",
            chapter_number=chapter_number,
        )

        saved_job = self._repository.create_writing_job(job)

        if process_inline:
            return self.process_generation(saved_job.job_id)

        return saved_job

    def process_generation(self, job_id: str) -> WritingGenerationJob:
        """Process queued writing job: retrieve context, call LLM, run validations, update state."""
        job = self._repository.get_writing_job(job_id)
        if job.status == "completed":
            return job

        # 1. Pinned Story Brain Version Recheck (Invariant: do not silently use newer brain version)
        brain = self._repository.get_story_brain(job.novel_id)
        current_brain_version = int(brain.metadata.get("brain_version", "1"))
        if job.expected_brain_version > 0 and current_brain_version != job.expected_brain_version:
            logger.warning(
                "Story brain version conflict for job %s: expected %s, found %s",
                job_id, job.expected_brain_version, current_brain_version,
            )
            stale_job = WritingGenerationJob(
                job_id=job.job_id,
                novel_id=job.novel_id,
                chapter_id=job.chapter_id,
                revision_id=job.revision_id,
                content_hash=job.content_hash,
                tenant_id=job.tenant_id,
                operation=job.operation,
                selection=job.selection,
                instruction=job.instruction,
                constraints=job.constraints,
                style=job.style,
                expected_brain_version=job.expected_brain_version,
                actor_id=job.actor_id,
                idempotency_key=job.idempotency_key,
                input_hash=job.input_hash,
                status="failed",
                stage="failed",
                validation_status="failed",
                error={
                    "code": "STALE_BRAIN_VERSION",
                    "message": f"Story brain version changed from {job.expected_brain_version} to {current_brain_version} while job was queued",
                },
                brain_version_used=current_brain_version,
                chapter_number=job.chapter_number,
            )
            return self._repository.save_writing_job(stale_job)

        brain_version_used = current_brain_version

        # Stage: preparing_context
        job = WritingGenerationJob(
            job_id=job.job_id,
            novel_id=job.novel_id,
            chapter_id=job.chapter_id,
            revision_id=job.revision_id,
            content_hash=job.content_hash,
            tenant_id=job.tenant_id,
            operation=job.operation,
            selection=job.selection,
            instruction=job.instruction,
            constraints=job.constraints,
            style=job.style,
            expected_brain_version=job.expected_brain_version,
            actor_id=job.actor_id,
            idempotency_key=job.idempotency_key,
            input_hash=job.input_hash,
            status="generating",
            stage="preparing_context",
            brain_version_used=brain_version_used,
            chapter_number=job.chapter_number,
        )
        self._repository.save_writing_job(job)

        selected_text = self._resolve_selected_text(job)
        semantic_query = self._build_semantic_query(
            instruction=job.instruction,
            selected_text=selected_text,
        )
        try:
            context_package = self.preview_context(
                tenant_id=job.tenant_id,
                story_id=job.novel_id,
                chapter_number=job.chapter_number,
                semantic_query=semantic_query,
            )
        except ContextRoutingUnresolvedError as exc:
            failed_job = replace(
                job,
                status="failed",
                stage="failed",
                validation_status="failed",
                error={
                    "code": "CONTEXT_SCOPE_EXCEEDS_MAX_TIER",
                    "message": str(exc),
                    "details": dict(exc.details),
                },
            )
            return self._repository.save_writing_job(failed_job)
        prompt_context = self._context_packer.prompt_context(context_package)
        context_hash = hashlib.sha256(
            json.dumps(
                prompt_context,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                default=str,
            ).encode("utf-8")
        ).hexdigest()

        # Stage: generating
        job = WritingGenerationJob(
            job_id=job.job_id,
            novel_id=job.novel_id,
            chapter_id=job.chapter_id,
            revision_id=job.revision_id,
            content_hash=job.content_hash,
            tenant_id=job.tenant_id,
            operation=job.operation,
            selection=job.selection,
            instruction=job.instruction,
            constraints=job.constraints,
            style=job.style,
            expected_brain_version=job.expected_brain_version,
            actor_id=job.actor_id,
            idempotency_key=job.idempotency_key,
            input_hash=job.input_hash,
            status="generating",
            stage="generating",
            context_summary=context_package.context_summary,
            brain_version_used=brain_version_used,
            context_hash=context_hash,
            chapter_number=job.chapter_number,
        )
        self._repository.save_writing_job(job)

        # selected_text was resolved before context retrieval so the same
        # author text participates in both semantic lookup and generation.


        # Call LLM service with style and constraints
        try:
            llm_result = self._llm_service.generate_writing_draft(
                operation=job.operation,
                selected_text=selected_text,
                cursor_offset=job.selection.get("cursor", 0),
                start_offset=job.selection.get("start"),
                end_offset=job.selection.get("end"),
                instruction=job.instruction,
                context_package=prompt_context,
                style=job.style,
                constraints=job.constraints,
            )
        except Exception as exc:
            logger.error("LLM draft generation failed for job %s: %s", job_id, exc)
            job = WritingGenerationJob(
                job_id=job.job_id,
                novel_id=job.novel_id,
                chapter_id=job.chapter_id,
                revision_id=job.revision_id,
                content_hash=job.content_hash,
                tenant_id=job.tenant_id,
                operation=job.operation,
                selection=job.selection,
                instruction=job.instruction,
                constraints=job.constraints,
                style=job.style,
                expected_brain_version=job.expected_brain_version,
                actor_id=job.actor_id,
                idempotency_key=job.idempotency_key,
                input_hash=job.input_hash,
                status="failed",
                stage="failed",
                error={"message": str(exc)},
                brain_version_used=brain_version_used,
                chapter_number=job.chapter_number,
            )
            return self._repository.save_writing_job(job)

        draft_text = llm_result.get("draft_text", "")
        patch_info = llm_result.get("patch", {})
        model_info = llm_result.get("model_info", {"provider": "llm"})

        patch = WritingPatch(
            start=patch_info.get("start", job.selection.get("start", 0)),
            end=patch_info.get("end", job.selection.get("end", 0)),
            replacement=patch_info.get("replacement", draft_text),
        )

        # Stage: validating
        base_len = job.selection.get("base_content_length")
        if base_len is None and self._revision_provider:
            try:
                rev = self._revision_provider.get_revision(
                    tenant_id=job.tenant_id,
                    novel_id=job.novel_id,
                    chapter_id=job.chapter_id,
                    revision_id=job.revision_id,
                )
                base_len = len(rev.content)
            except Exception:
                pass

        validations = self._validate_draft(
            draft_text=draft_text,
            patch=patch,
            context_package=context_package,
            constraints=job.constraints,
            instruction=job.instruction,
            base_content_length=base_len,
        )

        validation_status = "passed" if all(v.passed for v in validations) else "failed"

        completed_job = WritingGenerationJob(
            job_id=job.job_id,
            novel_id=job.novel_id,
            chapter_id=job.chapter_id,
            revision_id=job.revision_id,
            content_hash=job.content_hash,
            tenant_id=job.tenant_id,
            operation=job.operation,
            selection=job.selection,
            instruction=job.instruction,
            constraints=job.constraints,
            style=job.style,
            expected_brain_version=job.expected_brain_version,
            actor_id=job.actor_id,
            idempotency_key=job.idempotency_key,
            input_hash=job.input_hash,
            status="completed",
            stage="completed",
            draft=draft_text,
            patch=patch,
            validation_status=validation_status,
            validations=tuple(validations),
            context_summary=context_package.context_summary,
            model_info=model_info,
            brain_version_used=brain_version_used,
            context_hash=context_hash,
            chapter_number=job.chapter_number,
        )

        return self._repository.save_writing_job(completed_job)

    def _resolve_selected_text(self, job: WritingGenerationJob) -> str:
        if job.selection.get("source_text") is not None:
            raw_text = str(job.selection["source_text"])
            start = job.selection.get("start", 0)
            end = job.selection.get("end", len(raw_text))
            selected_text = raw_text[start:end]
            if not selected_text and start == end and raw_text:
                selected_text = raw_text
            return selected_text

        if self._revision_provider:
            try:
                revision = self._revision_provider.get_revision(
                    tenant_id=job.tenant_id,
                    novel_id=job.novel_id,
                    chapter_id=job.chapter_id,
                    revision_id=job.revision_id,
                )
                start = job.selection.get("start", 0)
                end = job.selection.get("end", start)
                return revision.content[start:end]
            except Exception:
                return ""
        return ""

    @staticmethod
    def _build_semantic_query(*, instruction: str, selected_text: str) -> str:
        parts = [
            value.strip()
            for value in (instruction, selected_text)
            if value and value.strip()
        ]
        return "\n\n".join(parts)

    @staticmethod
    def _semantic_match_payload(match: Any) -> dict[str, Any]:
        return {
            "memory_chunk_id": match.memory_chunk_id,
            "source_key": getattr(match, "source_key", None) or match.metadata.get("memory_id"),
            "memory_type": match.memory_type,
            "content": match.content,
            "content_hash": match.content_hash,
            "embedding_version": match.embedding_version,
            "cosine_distance": match.cosine_distance,
            "narrative_order": match.narrative_order,
            "chapter_number": match.chapter_number,
            "chapter_id": match.chapter_id,
            "revision_id": match.revision_id,
            "event_id": match.event_id,
            "entity_id": match.entity_id,
            "entity_ids": list(match.entity_ids),
            "importance_score": match.importance_score,
            "semantic_score": match.semantic_score,
            "entity_overlap_score": match.entity_overlap_score,
            "temporal_score": match.temporal_score,
            "relationship_score": match.relationship_score,
            "hybrid_score": match.hybrid_score,
            "metadata": dict(match.metadata),
        }

    def _validate_draft(
        self,
        *,
        draft_text: str,
        patch: WritingPatch,
        context_package: WritingContextPackage,
        constraints: tuple[str, ...],
        instruction: str,
        base_content_length: int | None = None,
    ) -> list[ValidationResult]:
        """Run deterministic schema, upper bounds, and narrative consistency checks."""
        results: list[ValidationResult] = []

        # 1. Patch offset sanity and upper bounds
        if patch.start < 0 or patch.end < patch.start:
            results.append(
                ValidationResult(
                    validator="patch_schema",
                    passed=False,
                    code="INVALID_OFFSETS",
                    message=f"Patch bounds invalid: start={patch.start}, end={patch.end}",
                )
            )
        elif base_content_length is not None and patch.end > base_content_length:
            results.append(
                ValidationResult(
                    validator="patch_schema",
                    passed=False,
                    code="PATCH_OUT_OF_BOUNDS",
                    message=f"Patch end offset ({patch.end}) exceeds base content length ({base_content_length})",
                )
            )
        else:
            results.append(
                ValidationResult(
                    validator="patch_schema",
                    passed=True,
                    code="OK",
                    message="Patch schema and offsets valid",
                )
            )

        # 1b. Empty draft check
        if not draft_text.strip() and not patch.replacement.strip():
            results.append(
                ValidationResult(
                    validator="patch_schema",
                    passed=False,
                    code="EMPTY_DRAFT",
                    message="Generated draft content and patch replacement cannot both be empty",
                )
            )

        # 2. Dead character action rule
        dead_characters: set[str] = set()
        for state in context_package.current_states:
            name = state.get("name", "")
            status = str(state.get("status", "")).lower()
            inner_state = state.get("state", {})
            alive = inner_state.get("alive")
            if not name:
                continue
            if status in ("dead", "deceased", "tử trận", "đã chết") or alive is False:
                dead_characters.add(name)

        action_keywords = [
            "nói", "cười", "đứng", "bước", "nhìn", "hỏi", "đánh", "quát",
            "thở", "chạy", "cầm", "thu hồi", "kích hoạt", "nói thầm", "vung tay",
            "hét", "la", "tiến lại", "rút lui", "gật đầu", "lắc đầu",
        ]
        action_pattern = "|".join(action_keywords)

        target_text = f"{draft_text} {patch.replacement}".strip()

        for dead_name in dead_characters:
            pattern = rf"(?i)\b{re.escape(dead_name)}\b.*?(?:{action_pattern})|(?:{action_pattern}).*?\b{re.escape(dead_name)}\b"
            if re.search(pattern, target_text):
                results.append(
                    ValidationResult(
                        validator="character_state",
                        passed=False,
                        code="DEAD_CHARACTER_ACTION",
                        message=f"Character '{dead_name}' is dead but depicted performing actions in draft",
                    )
                )

        # 3. Locked world rules violation
        target_lower = target_text.lower()
        for rule in context_package.world_rules:
            rule_text = str(
                rule.get("fact_value")
                or rule.get("statement")
                or rule.get("description")
                or rule.get("summary")
                or rule.get("value")
                or rule.get("rule")
                or ""
            ).lower()
            if not rule_text:
                continue

            # Check if rule forbids teleportation in barriers
            forbidden_phrases = ["không thể dịch chuyển", "cấm dịch chuyển", "không được dịch chuyển", "chặn dịch chuyển"]
            if any(phrase in rule_text for phrase in forbidden_phrases):
                has_teleport_action = any(action in target_lower for action in ["dịch chuyển", "thuấn di", "xé rách không gian"])
                has_barrier_context = any(ctx in target_lower or ctx in rule_text for ctx in ["kết giới", "phong tỏa", "trận pháp", "cấm chế"])
                if has_teleport_action and has_barrier_context:
                    results.append(
                        ValidationResult(
                            validator="world_rule",
                            passed=False,
                            code="WORLD_RULE_VIOLATION",
                            message=f"Draft violates world rule: '{rule_text}'",
                        )
                    )

        return results
