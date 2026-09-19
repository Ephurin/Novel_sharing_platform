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
from domain.errors import BaselineReviewRequiredError, BootstrapLimitExceededError
from domain.models import BootstrapJob, BootstrapRevision, NarrativeProposal, ProposalStatus
from domain.repositories import NarrativeRepository


class ManuscriptBootstrapService:
    """Durable chapter-checkpoint worker for importing immutable revisions."""

    def __init__(
        self,
        repository: NarrativeRepository,
        revision_provider: RevisionContentProvider,
        analysis_service: RevisionAnalysisService,
        *,
        max_chapters: int = 100,
        max_characters: int = 2_000_000,
    ) -> None:
        self._repository = repository
        self._revision_provider = revision_provider
        self._analysis_service = analysis_service
        self._max_chapters = max_chapters
        self._max_characters = max_characters

    def start(
        self,
        *,
        tenant_id: str,
        novel_id: str,
        revisions: list[dict[str, str]],
        locale: str,
        options: dict[str, bool],
    ) -> BootstrapJob:
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
        job_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"bootstrap:{identity}"))
        job = BootstrapJob(
            job_id=job_id,
            novel_id=novel_id,
            tenant_id=tenant_id,
            revisions=tuple(BootstrapRevision(**item) for item in revisions),
            locale=locale,
            options=options,
        )
        return self._repository.create_bootstrap_job(job)

    def process(self, job_id: str) -> BootstrapJob:
        job = self._repository.get_bootstrap_job(job_id)
        if job.status in {"waiting_review", "completed", "cancelled"}:
            return job
        job = self._repository.save_bootstrap_job(replace(job, status="running", stage="chapter_analysis"))
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
                        result={"scene_count": scene_count},
                    )
                )
            proposals = self._repository.list_proposals(job.novel_id, status="pending")
            result = {
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
        if job.status == "failed":
            job = self._repository.save_bootstrap_job(
                replace(job, status="queued", stage="queued", error=None)
            )
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
        baseline_revision_id = job.revisions[-1].revision_id
        result = self._repository.activate_baseline(novel_id, job_id, baseline_revision_id)
        self._repository.save_bootstrap_job(
            replace(job, status="completed", stage="completed", result={**(job.result or {}), **result})
        )
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
