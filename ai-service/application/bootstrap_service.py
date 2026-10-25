from __future__ import annotations

import hashlib
import json
import re
import unicodedata
import uuid
from dataclasses import asdict, replace
from typing import Any

from application.ports import ContentHashMismatchError, RevisionContentProvider
from application.revision_analysis_service import RevisionAnalysisService
from domain.errors import BaselineReviewRequiredError, BootstrapLimitExceededError, BootstrapConflictError
from domain.models import BootstrapJob, BootstrapRevision, NarrativeProposal, ProposalStatus, AnalysisRun
from domain.repositories import NarrativeRepository


class ManuscriptBootstrapService:
    """Durable chapter-checkpoint worker for importing immutable revisions."""

    def __init__(
        self,
        repository: NarrativeRepository,
        revision_provider: RevisionContentProvider,
        analysis_service: RevisionAnalysisService,
        llm_service: Any = None,
        *,
        max_chapters: int = 100,
        max_characters: int = 2_000_000,
    ) -> None:
        self._repository = repository
        self._revision_provider = revision_provider
        self._analysis_service = analysis_service
        self._llm_service = llm_service
        self._max_chapters = max_chapters
        self._max_characters = max_characters

    def _scope(self, tenant_id):
        configured = getattr(self._repository, '_tenant_id', None)
        if configured is not None and str(configured) != str(tenant_id):
            raise PermissionError('TENANT_SCOPE_MISMATCH')

    @staticmethod
    def _key(tenant, novel, kind, key):
        return str(uuid.uuid5(uuid.NAMESPACE_URL, f'bootstrap-key:{tenant}:{novel}:{kind}:{key}'))

    def _replay(self, job_id, tenant, novel, input_hash):
        try:
            job = self._repository.get_bootstrap_job(job_id)
        except KeyError:
            return None
        if job.tenant_id != tenant or job.novel_id != novel:
            raise PermissionError('SCOPE_MISMATCH')
        stored = (job.result or {}).get('bootstrap_input_hash')
        if stored is not None and stored != input_hash:
            from domain.errors import IdempotencyConflictError
            raise IdempotencyConflictError(job_id)
        return job

    def _preflight_active(self, novel):
        try:
            brain = self._repository.get_story_brain(novel, read_only=True)
        except KeyError:
            return
        if brain.metadata.get('status') == 'active':
            raise BootstrapConflictError('ALREADY_ACTIVE')

    def _reserve(self, job):
        if not getattr(self._repository, 'supports_bootstrap_lifecycle', False):
            raise BootstrapConflictError('BOOTSTRAP_REQUIRES_POSTGRES')
        return self._repository.create_bootstrap_job(job)

    def start(
        self,
        *,
        tenant_id: str,
        novel_id: str,
        revisions: list[dict[str, str]],
        locale: str,
        options: dict[str, bool],
        idempotency_key: str | None = None,
    ) -> BootstrapJob:
        self._scope(tenant_id)
        identity = json.dumps({"tenant_id": tenant_id, "novel_id": novel_id, "revisions": revisions, "options": options}, sort_keys=True)
        job_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"bootstrap:{identity}")) if not idempotency_key else self._key(tenant_id, novel_id, 'manuscript', idempotency_key)
        request_hash = hashlib.sha256((identity + (locale if idempotency_key else "")).encode()).hexdigest()
        replay = self._replay(job_id, tenant_id, novel_id, request_hash)
        if replay: return replay
        self._preflight_active(novel_id)
        # Preflight immutable content so the HTTP contract can reject bad hash/limits
        # before a durable job is accepted.
        total_characters = 0
        for item in revisions:
            content = self._revision_provider.get_revision(
                tenant_id=tenant_id,
                novel_id=novel_id,
                chapter_id=item["chapter_id"],
                revision_id=item["revision_id"],
            )
            actual_hash = hashlib.sha256(content.content.encode("utf-8")).hexdigest()
            if actual_hash != item["content_hash"] or content.content_hash != item["content_hash"]:
                raise ContentHashMismatchError(item["revision_id"])
            total_characters += len(content.content)
        if len(revisions) > self._max_chapters or total_characters > self._max_characters:
            raise BootstrapLimitExceededError(
                chapters=len(revisions),
                characters=total_characters,
                max_chapters=self._max_chapters,
                max_characters=self._max_characters,
            )

        identity = json.dumps(
            {"tenant_id": tenant_id, "novel_id": novel_id, "revisions": revisions, "options": options},
            sort_keys=True,
        )
        job_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"bootstrap:{identity}")) if not idempotency_key else self._key(tenant_id, novel_id, "manuscript", idempotency_key)
        job = BootstrapJob(
            job_id=job_id,
            novel_id=novel_id,
            tenant_id=tenant_id,
            revisions=tuple(BootstrapRevision(**item) for item in revisions),
            locale=locale,
            options=options,
            result={"bootstrap_input_hash": request_hash},
        )
        return self._reserve(job)

    def start_from_idea(
        self,
        *,
        tenant_id: str,
        novel_id: str,
        idea: str,
        outline: str | None = None,
        locale: str = "vi-VN",
        preferences: dict[str, Any] | None = None,
        author_constraints: list[str] | None = None,
        mode: str = "blueprint",
        idempotency_key: str | None = None,
    ) -> BootstrapJob:
        self._scope(tenant_id)
        if mode != "blueprint":
            raise ValueError("EXTRACT_NOT_IMPLEMENTED" if mode == "extract" else "INVALID_MODE")
        if not idea or not idea.strip():
            raise ValueError("idea must not be empty")

        preferences = preferences or {}
        author_constraints = list(author_constraints or [])

        locale_norm = (locale or "vi-VN").strip().lower()

        identity = json.dumps(
            {
                "tenant_id": tenant_id,
                "novel_id": novel_id,
                "locale": locale_norm,
                "idea": idea.strip(),
                "outline": (outline or "").strip(),
                "preferences": preferences,
                "author_constraints": author_constraints,
            },
            sort_keys=True,
        )
        job_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"bootstrap-idea:{identity}")) if not idempotency_key else self._key(tenant_id, novel_id, 'idea', idempotency_key)
        input_hash = hashlib.sha256(identity.encode("utf-8")).hexdigest()
        replay = self._replay(job_id, tenant_id, novel_id, input_hash)
        if replay: return replay
        token = str(uuid.uuid4())
        reservation = BootstrapJob(job_id=job_id, tenant_id=tenant_id, novel_id=novel_id,
            revisions=(), locale=locale, options={"from_idea": True, "require_review_for_all": True},
            status="running", stage="blueprint", result={"bootstrap_input_hash": input_hash,
                "reservation_token": token, "mode": "blueprint", "origin": "model_proposed" if self._llm_service else "author_supplied",
                "source_hash": input_hash, "contract_version": "p2-01a-v1"})
        reserved = self._reserve(reservation)
        if (reserved.result or {}).get('reservation_token') != token:
            return reserved
        brain = self._repository.get_story_brain(novel_id)
        brain_version = int(brain.metadata.get("brain_version", "1"))
        try:
            blueprint = self._generate_blueprint(idea=idea, outline=outline,
                preferences=preferences, author_constraints=author_constraints)
        except Exception:
            self._repository.fail_bootstrap_job(reserved)
            raise
        try:
            run = AnalysisRun(run_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"bootstrap-run:{job_id}")),
                idempotency_key=f"{tenant_id}:bootstrap-idea:{job_id}", input_hash=input_hash,
                operation="bootstrap_idea", pipeline_version="idea-bootstrap-v1", status="pending")

            group_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"proposal-group:{run.run_id}"))
            proposals: list[NarrativeProposal] = []

            # 1. Premise proposal (fact)
            premise_text = blueprint.get("premise", idea).strip()
            premise_hash = hashlib.sha256(premise_text.casefold().encode("utf-8")).hexdigest()[:16]
            proposals.append(
                NarrativeProposal(
                    proposal_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"prop:{run.run_id}:premise:{premise_hash}")),
                    proposal_type="fact",
                    payload={
                        "fact_type": "premise",
                        "fact_key": "story_premise",
                        "fact_value": premise_text,
                        "priority": 100,
                    },
                    analysis_run_id=run.run_id,
                    dependency_group_id=group_id,
                    materialization_order=len(proposals),
                    evidence=(),
                    confidence=1.0,
                    expected_brain_version=brain_version,
                    status=ProposalStatus.PENDING,
                )
            )

            # 2. World Rules proposals (fact)
            for rule in blueprint.get("world_rules", []):
                rule_str = str(rule).strip()
                if not rule_str:
                    continue
                rule_hash = hashlib.sha256(rule_str.casefold().encode("utf-8")).hexdigest()[:16]
                proposals.append(
                    NarrativeProposal(
                        proposal_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"prop:{run.run_id}:rule:{rule_hash}")),
                        proposal_type="fact",
                        payload={
                            "fact_type": "world_rule",
                            "fact_key": f"world_rule_{rule_hash}",
                            "fact_value": rule_str,
                            "priority": 100,
                        },
                        analysis_run_id=run.run_id,
                        dependency_group_id=group_id,
                        materialization_order=len(proposals),
                        evidence=(),
                        confidence=0.95,
                        expected_brain_version=brain_version,
                        status=ProposalStatus.PENDING,
                    )
                )

            # 3. Entity proposals (entity)
            for ent in blueprint.get("entities", []):
                name = str(ent.get("name", "")).strip()
                if not name:
                    continue
                ent_type = str(ent.get("type") or ent.get("entity_type") or "character").lower()
                if ent_type not in {"character", "location", "organization", "item"}:
                    ent_type = "character"
                ent_hash = hashlib.sha256(name.casefold().encode("utf-8")).hexdigest()[:16]
                score_val = float(ent.get("score", 9.0))
                confidence = score_val / 10.0 if score_val > 1.0 else score_val
                proposals.append(
                    NarrativeProposal(
                        proposal_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"prop:{run.run_id}:entity:{ent_hash}")),
                        proposal_type="entity",
                        payload={
                            "canonical_name": name,
                            "normalized_name": name.casefold(),
                            "entity_type": ent_type,
                        },
                        analysis_run_id=run.run_id,
                        dependency_group_id=group_id,
                        materialization_order=len(proposals),
                        evidence=(),
                        confidence=confidence,
                        expected_brain_version=brain_version,
                        status=ProposalStatus.PENDING,
                    )
                )

            # 4. Author constraints (fact)
            for constraint in author_constraints:
                c_str = str(constraint).strip()
                if not c_str:
                    continue
                c_hash = hashlib.sha256(c_str.casefold().encode("utf-8")).hexdigest()[:16]
                proposals.append(
                    NarrativeProposal(
                        proposal_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"prop:{run.run_id}:constraint:{c_hash}")),
                        proposal_type="fact",
                        payload={
                            "fact_type": "world_rule",
                            "fact_key": f"author_constraint_{c_hash}",
                            "fact_value": c_str,
                            "priority": 100,
                        },
                        analysis_run_id=run.run_id,
                        dependency_group_id=group_id,
                        materialization_order=len(proposals),
                        evidence=(),
                        confidence=1.0,
                        expected_brain_version=brain_version,
                        status=ProposalStatus.PENDING,
                    )
                )

            job = BootstrapJob(
                job_id=job_id,
                novel_id=novel_id,
                tenant_id=tenant_id,
                revisions=(),
                locale=locale,
                options={"from_idea": True, "require_review_for_all": True},
                status="waiting_review",
                stage="review",
                result={
                    **(reserved.result or {}),
                    "proposal_count": len(proposals),
                    "required_proposal_ids": [p.proposal_id for p in proposals],
                    "duplicate_candidate_groups": [],
                },
            )
            return self._repository.finalize_idea_bootstrap(job, proposals, run)
        except Exception:
            self._repository.fail_bootstrap_job(reserved)
            raise

    def _generate_blueprint(
        self,
        *,
        idea: str,
        outline: str | None = None,
        preferences: dict[str, Any] | None = None,
        author_constraints: list[str] | None = None,
    ) -> dict[str, Any]:
        preferences = preferences or {}
        author_constraints = author_constraints or []
        if self._llm_service and hasattr(self._llm_service, "generate_story_blueprint"):
            return self._llm_service.generate_story_blueprint(
                idea=idea,
                outline=outline,
                preferences=preferences,
                author_constraints=author_constraints,
            )
        if self._llm_service and hasattr(self._llm_service, "_call_llm"):
            system_prompt = (
                "You are an expert novel architect. Generate a structured story blueprint from the premise. "
                "Return only a JSON object with this schema: "
                '{"premise": "...", "world_rules": ["..."], "entities": [{"name": "...", "entity_type": "character|location", "score": 9.0}], "author_constraints": ["..."]}'
            )
            user_prompt = f"Idea:\n{idea}\n\nOutline:\n{outline or ''}\n\nPreferences:\n{json.dumps(preferences)}\n\nConstraints:\n{json.dumps(author_constraints)}"
            try:
                raw = self._llm_service._call_llm(system_prompt=system_prompt, user_prompt=user_prompt)
                data = json.loads(raw)
                if isinstance(data, dict) and "premise" in data and isinstance(data["premise"], str) and data["premise"].strip():
                    return data
                raise ValueError("LLM response did not contain valid non-empty 'premise' field")
            except Exception as e:
                raise RuntimeError(f"Provider failed to generate structured story blueprint: {e}") from e

        # Explicit no-provider / offline path: derive strictly from user-supplied inputs
        world_rules: list[str] = []
        if preferences.get("tone"):
            world_rules.append(f"Tone: {preferences['tone']}")
        if preferences.get("genre"):
            g = preferences["genre"]
            genre_str = ", ".join(g) if isinstance(g, list) else str(g)
            world_rules.append(f"Genre: {genre_str}")

        return {
            "premise": idea.strip(),
            "world_rules": world_rules,
            "entities": [],
            "author_constraints": author_constraints,
        }

    def process(self, job_id: str) -> BootstrapJob:
        job = self._repository.get_bootstrap_job(job_id)
        if job.status in {"waiting_review", "completed", "cancelled"}:
            return job
        try:
            job = self._repository.start_bootstrap_processing(job_id)
        except BootstrapConflictError as exc:
            if exc.code == 'BOOTSTRAP_IN_PROGRESS':
                return self._repository.get_bootstrap_job(job_id)
            raise
        revisions = list(job.revisions)
        scene_count = int((job.result or {}).get("scene_count", 0))
        try:
            for index, item in enumerate(revisions):
                if item.status == "completed":
                    continue
                content = self._revision_provider.get_revision(
                    tenant_id=job.tenant_id,
                    novel_id=job.novel_id,
                    chapter_id=item.chapter_id,
                    revision_id=item.revision_id,
                )
                scene_count += len(self._split_scenes(content.content))
                result = self._analysis_service.analyze(
                    tenant_id=job.tenant_id,
                    novel_id=job.novel_id,
                    chapter_id=item.chapter_id,
                    revision_id=item.revision_id,
                    content_hash=item.content_hash,
                    operation="bootstrap_manuscript",
                    idempotency_key=f"bootstrap:{job.job_id}:{item.revision_id}",
                    options={
                        "extract_entities": True,
                        "extract_events": True,
                        "extract_state_transitions": True,
                        "extract_world_rules": bool(
                            job.options.get("extract_world_rules", True)
                        ),
                        "check_consistency": True,
                        "build_embeddings": bool(job.options.get("build_embeddings", False)),
                    },
                )
                revisions[index] = replace(
                    item,
                    status="completed",
                    proposal_count=len(result.proposals),
                    analysis_run_id=result.analysis_run.run_id,
                )
                job = self._repository.save_bootstrap_job(
                    replace(
                        job,
                        revisions=tuple(revisions),
                        progress_current=sum(r.status == "completed" for r in revisions),
                        result={**(job.result or {}), "scene_count": scene_count},
                    )
                )
            proposals = self._repository.list_proposals(job.novel_id, status="pending")
            result = {
                **(job.result or {}),
                "proposal_count": len(proposals),
                "required_proposal_ids": [
                    item.proposal_id for item in proposals
                    if job.options.get("require_review_for_all", True)
                    or item.proposal_type in {"world_rule", "fact", "entity", "alias"}
                ],
                "scene_count": scene_count,
                "duplicate_candidate_groups": self._duplicate_groups(proposals),
            }
            return self._repository.save_bootstrap_job(
                replace(job, status="waiting_review", stage="review", result=result)
            )
        except Exception as exc:
            self._repository.save_bootstrap_job(
                replace(job, status="failed", stage="failed", error={"message": str(exc)})
            )
            raise

    def get_job(self, job_id: str) -> BootstrapJob:
        return self._repository.get_bootstrap_job(job_id)

    def resume(self, job_id: str) -> BootstrapJob:
        job = self._repository.get_bootstrap_job(job_id)
        if job.options.get('from_idea'):
            # Exact replay returns its persisted failure; a new operation is explicit.
            return job
        return self.process(job.job_id)

    def review_queue(self, novel_id: str) -> list[dict[str, Any]]:
        proposals = self._repository.list_proposals(novel_id, status="pending")
        duplicates = self._duplicate_groups(proposals)
        duplicate_ids = {
            proposal_id for group in duplicates for proposal_id in group["proposal_ids"]
        }
        queue = []
        for proposal in proposals:
            priority, reason = self._priority(proposal, proposal.proposal_id in duplicate_ids)
            queue.append({**asdict(proposal), "review_priority": priority, "review_reason": reason})
        return sorted(queue, key=lambda item: (-item["review_priority"], item["materialization_order"]))

    def activate_baseline(self, novel_id: str, job_id: str) -> dict[str, Any]:
        job = self._repository.get_bootstrap_job(job_id)
        if job.novel_id != novel_id:
            raise KeyError(job_id)
        required = set((job.result or {}).get("required_proposal_ids", []))
        pending = {
            item.proposal_id
            for item in self._repository.list_proposals(novel_id, status="pending")
        }
        unresolved = sorted(required & pending)
        if unresolved:
            raise BaselineReviewRequiredError(unresolved)
        baseline_revision_id = job.revisions[-1].revision_id if job.revisions else None
        result = self._repository.activate_baseline(novel_id, job_id, baseline_revision_id)
        return result

    @staticmethod
    def _split_scenes(content: str) -> list[str]:
        parts = re.split(r"(?:\r?\n){2,}|(?:^|\n)\s*(?:\*{3,}|#{2,})\s*(?:\n|$)", content)
        return [part.strip() for part in parts if part.strip()]

    @classmethod
    def _duplicate_groups(cls, proposals: list[NarrativeProposal]) -> list[dict[str, Any]]:
        groups: dict[str, list[NarrativeProposal]] = {}
        for item in proposals:
            if item.proposal_type != "entity":
                continue
            name = str(item.payload.get("canonical_name", ""))
            key = "".join(
                char for char in unicodedata.normalize("NFKD", name.casefold())
                if char.isalnum() and not unicodedata.combining(char)
            )
            groups.setdefault(key, []).append(item)
        return [
            {
                "resolution_key": key,
                "names": sorted({str(item.payload.get("canonical_name", "")) for item in items}),
                "proposal_ids": [item.proposal_id for item in items],
            }
            for key, items in groups.items()
            if len({str(item.payload.get("canonical_name", "")).casefold() for item in items}) > 1
        ]

    @staticmethod
    def _priority(proposal: NarrativeProposal, duplicate: bool) -> tuple[int, str]:
        if duplicate:
            return 90, "duplicate_or_ambiguous_entity"
        if proposal.proposal_type in {"world_rule", "fact"}:
            return 80, "world_rule_or_author_fact"
        if proposal.proposal_type in {"state_transition", "initial_state"}:
            return 70, "current_character_state"
        if proposal.confidence is not None and proposal.confidence < 0.7:
            return 60, "low_confidence"
        return 40, "standard_review"
