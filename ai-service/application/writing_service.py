from __future__ import annotations

import hashlib
import logging
import re
import uuid
from typing import Any

import json
from application.ports import ContentHashMismatchError, RevisionContentProvider
from domain.errors import (
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
    ) -> None:
        self._repository = repository
        self._llm_service = llm_service
        self._revision_provider = revision_provider

    def preview_context(
        self,
        *,
        tenant_id: str,
        story_id: str,
        chapter_number: int | None = None,
        character_name: str | None = None,
        limit_recent_events: int = 20,
        token_budget: int | None = None,
    ) -> WritingContextPackage:
        """Fetch and structure narrative context for writing assistance."""
        package = self._repository.get_structured_context(
            story_id=story_id,
            chapter_number=chapter_number,
            character_name=character_name,
            limit_recent_events=limit_recent_events,
        )

        if token_budget is not None and token_budget > 0:
            current_budget = dict(package.token_budget)
            current_budget["maximum"] = token_budget
            # If used exceeds maximum, we can trim lower priority items
            package = WritingContextPackage(
                brain_version=package.brain_version,
                entities=package.entities,
                current_states=package.current_states,
                recent_events=package.recent_events,
                world_rules=package.world_rules,
                author_constraints=package.author_constraints,
                token_budget=current_budget,
                context_summary=package.context_summary,
            )

        return package

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
        actor_id: str | None = None,
        idempotency_key: str = "",
        process_inline: bool = True,
    ) -> WritingGenerationJob:
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

        # 2. Content & Bounds validation via Revision Provider (if present)
        cursor = selection.get("cursor", 0)
        start = selection.get("start", cursor)
        end = selection.get("end", cursor)

        if start < 0 or end < start or cursor < 0:
            raise SelectionOutOfBoundsError(
                f"Negative offsets in selection: start={start}, end={end}, cursor={cursor}"
            )

        base_content_length: int | None = None
        if self._revision_provider:
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

        # 3. Brain Version validation
        brain = self._repository.get_story_brain(novel_id)
        current_version = int(brain.metadata.get("brain_version", "1"))
        if expected_brain_version > 0 and current_version != expected_brain_version:
            raise OptimisticLockError(
                f"Story brain version conflict: expected {expected_brain_version}, found {current_version}"
            )

        selection_with_meta = dict(selection)
        if base_content_length is not None:
            selection_with_meta["base_content_length"] = base_content_length

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
        )
        self._repository.save_writing_job(job)

        context_package = self.preview_context(
            tenant_id=job.tenant_id,
            story_id=job.novel_id,
        )

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
        )
        self._repository.save_writing_job(job)

        # Extract selected text if revision provider available
        selected_text = ""
        if self._revision_provider:
            try:
                rev = self._revision_provider.get_revision(
                    tenant_id=job.tenant_id,
                    novel_id=job.novel_id,
                    chapter_id=job.chapter_id,
                    revision_id=job.revision_id,
                )
                start = job.selection.get("start", 0)
                end = job.selection.get("end", start)
                selected_text = rev.content[start:end]
            except Exception:
                pass

        # Call LLM service
        try:
            llm_result = self._llm_service.generate_writing_draft(
                operation=job.operation,
                selected_text=selected_text,
                cursor_offset=job.selection.get("cursor", 0),
                start_offset=job.selection.get("start"),
                end_offset=job.selection.get("end"),
                instruction=job.instruction,
                context_package={
                    "brain_version": context_package.brain_version,
                    "entities": list(context_package.entities),
                    "current_states": list(context_package.current_states),
                    "world_rules": list(context_package.world_rules),
                    "recent_events": list(context_package.recent_events),
                },
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
        )

        return self._repository.save_writing_job(completed_job)

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
