import hashlib
import json
import unittest

from application.narrative_service import NarrativeApplicationService
from application.ports import RevisionContent
from application.revision_analysis_service import RevisionAnalysisService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from services.entity_pipeline.pipeline import EntityPipeline


class SequenceLLMService:
    model = "fake-model"

    def __init__(self, responses: list[str]) -> None:
        self.responses = list(responses)
        self.calls = 0

    def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        self.calls += 1
        return self.responses.pop(0)


class RevisionAnalysisWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.content = "Minh đến Đế đô."
        self.content_hash = hashlib.sha256(self.content.encode("utf-8")).hexdigest()
        revision = RevisionContent(
            revision_id="revision-1",
            novel_id="novel-1",
            chapter_id="chapter-1",
            content=self.content,
            content_hash=self.content_hash,
        )
        self.repository = InMemoryNarrativeRepository()
        self.llm = SequenceLLMService(
            [
                json.dumps(
                    [
                        {"phrase": "Minh", "entity": "PER", "score": 0.98},
                        {"phrase": "Đế đô", "entity": "LOC", "score": 0.95},
                    ],
                    ensure_ascii=False,
                ),
                json.dumps(
                    {
                        "events": [
                            {
                                "participants": ["Minh"],
                                "locations": ["Đế đô"],
                                "summary": self.content,
                                "event_type": "movement",
                                "importance_score": 0.7,
                            }
                        ]
                    },
                    ensure_ascii=False,
                ),
            ]
        )
        self.analysis = RevisionAnalysisService(
            self.repository,
            InMemoryRevisionContentProvider([revision]),
            EntityPipeline("entity-test-v1", "prompt-test-v1"),
            self.llm,
        )

    def _analyze(self):
        return self.analysis.analyze(
            tenant_id="tenant-1",
            novel_id="novel-1",
            chapter_id="chapter-1",
            revision_id="revision-1",
            content_hash=self.content_hash,
            operation="incremental_story_analysis",
            idempotency_key="request-1",
            options={"extract_entities": True, "extract_events": True},
        )

    def test_analysis_creates_evidenced_proposals_without_canonical_writes(self) -> None:
        result = self._analyze()

        self.assertEqual(len(result.proposals), 3)
        self.assertEqual(self.repository.list_entities("novel-1"), [])
        entity = result.proposals[0]
        evidence = entity.evidence[0]
        self.assertEqual(self.content[evidence["start"] : evidence["end"]], "Minh")
        self.assertEqual(evidence["text_hash"], self.content_hash)

    def test_same_revision_and_idempotency_key_does_not_duplicate_or_recall_llm(self) -> None:
        first = self._analyze()
        second = self._analyze()

        self.assertFalse(first.deduplicated)
        self.assertTrue(second.deduplicated)
        self.assertEqual(self.llm.calls, 2)
        self.assertEqual(
            [item.proposal_id for item in first.proposals],
            [item.proposal_id for item in second.proposals],
        )

    def test_author_accept_materializes_entity_and_increments_brain_version(self) -> None:
        result = self._analyze()
        entity_proposal = result.proposals[0]
        workflow = NarrativeApplicationService(self.repository)

        decision = workflow.accept_proposal_by_id(
            entity_proposal.proposal_id, expected_brain_version=1
        )

        self.assertEqual(decision["status"], "accepted")
        self.assertEqual(decision["brain_version"], 2)
        self.assertEqual(len(self.repository.list_entities("novel-1")), 1)
