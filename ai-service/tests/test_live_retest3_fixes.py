"""Findings from the third P2 live retest on main (2026-11-15): P2, pending event groups made against
an older Story Brain version could never be accepted, and re-analysis re-proposed approved events."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from application.bootstrap_service import ManuscriptBootstrapService
from domain.errors import OptimisticLockError
from domain.event_duplicates import can_rebase, duplicate_event
from domain.models import NarrativeEvent, NarrativeProposal
from domain.projection import ProjectionError
from infrastructure.orm_models import Base, SCHEMA
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository

TENANT = "00000000-0000-0000-0000-000000000001"
STORY = "story-p2"


@pytest.fixture
def repo():
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False},
                           poolclass=StaticPool, execution_options={"schema_translate_map": {SCHEMA: None}})
    Base.metadata.create_all(engine)
    yield PostgresNarrativeRepository(sessionmaker(bind=engine, expire_on_commit=False), tenant_id=TENANT, actor_id=TENANT)
    engine.dispose()


def proposal(n, kind, payload, group, evidence=()):
    return NarrativeProposal(proposal_id=f"20000000-0000-0000-0000-0000000000{n:02d}", proposal_type=kind,
                             payload=payload, dependency_group_id=f"30000000-0000-0000-0000-0000000000{group:02d}",
                             evidence=tuple(evidence))


def event(n, summary, quote, group, chapter=1):
    return proposal(n, "event", {"event_type": "discovery", "participants": [], "summary": summary, "chapter": chapter},
                    group, [{"quote": quote, "chapter_number": chapter}])


def version(repo):
    return int(repo.get_story_brain(STORY).metadata["brain_version"])


def test_p2_an_event_group_made_before_another_review_can_still_be_accepted(repo):
    first = event(1, "Vũ tìm thấy kiếm gãy.", "cậu tìm thấy nửa thanh kiếm gãy", 1)
    second = event(2, "Lam Yên báo tin sát thủ.", "Lam Yên gấp gáp báo tin", 2)
    repo.save_proposals(STORY, [first, second])
    repo.accept_proposal_group(STORY, [first.proposal_id], expected_brain_version=1)
    assert version(repo) == 2
    queue = {p["proposal_id"]: p for p in ManuscriptBootstrapService(repo, None, None).review_queue(STORY)}
    assert queue[second.proposal_id]["stale"] is False
    repo.accept_proposal_group(STORY, [second.proposal_id], expected_brain_version=2)
    assert version(repo) == 3 and len(repo.get_story_brain(STORY).events) == 2


def test_p2_the_author_must_still_be_on_the_current_version(repo):
    first, second = event(1, "A", "q1", 1), event(2, "B", "q2", 2)
    repo.save_proposals(STORY, [first, second])
    repo.accept_proposal_group(STORY, [first.proposal_id], expected_brain_version=1)
    with pytest.raises(OptimisticLockError):
        repo.accept_proposal_group(STORY, [second.proposal_id], expected_brain_version=1)


def test_p2_stale_groups_with_facts_stay_locked_and_are_marked_stale(repo):
    first = event(1, "A", "q1", 1)
    fact = proposal(2, "fact", {"fact_key": "hometown", "fact_value": "Thạch Khê"}, 2)
    repo.save_proposals(STORY, [first, fact])
    repo.accept_proposal_group(STORY, [first.proposal_id], expected_brain_version=1)
    queue = {p["proposal_id"]: p for p in ManuscriptBootstrapService(repo, None, None).review_queue(STORY)}
    assert queue[fact.proposal_id]["stale"] is True
    with pytest.raises(OptimisticLockError):
        repo.accept_proposal_group(STORY, [fact.proposal_id], expected_brain_version=2)


def test_p2_a_repeated_event_is_flagged_and_cannot_be_accepted_twice(repo):
    original = event(1, "Vũ tìm thấy kiếm gãy.", "cậu tìm thấy nửa thanh kiếm gãy cắm trong đá", 1)
    repeat = event(2, "Trần Vũ tìm thấy nửa thanh kiếm gãy tại lò rèn.", "cậu tìm thấy nửa thanh kiếm  gãy cắm trong đá", 2)
    repo.save_proposals(STORY, [original, repeat])
    repo.accept_proposal_group(STORY, [original.proposal_id], expected_brain_version=1)
    queue = {p["proposal_id"]: p for p in ManuscriptBootstrapService(repo, None, None).review_queue(STORY)}
    assert queue[repeat.proposal_id]["duplicate_of_event"]["chapter"] == 1
    with pytest.raises(ProjectionError, match="đã có trong bộ nhớ"):
        repo.accept_proposal_group(STORY, [repeat.proposal_id], expected_brain_version=2)
    assert len(repo.get_story_brain(STORY).events) == 1


def test_p2_duplicate_rules():
    known = [NarrativeEvent(event_id="e1", event_type="x", summary="Vũ rời làng.", chapter=2,
                            metadata={"evidence": [{"quote": "sáng nay cậu tìm thấy nửa thanh kiếm gãy cắm trong đá"}]})]
    # Live case: the re-analysis quoted a longer passage around the same sentence.
    longer = [{"quote": "Đêm qua sét đánh ba lần, và sáng nay cậu  tìm thấy nửa thanh kiếm gãy cắm trong đá, trên chuôi"}]
    assert duplicate_event({"summary": "Khác", "chapter": 2}, longer, known) is known[0]
    assert duplicate_event({"summary": "Khác", "chapter": 3}, longer, known) is None
    assert duplicate_event({"summary": "Vũ rời làng.", "chapter": 2}, [], known) is None
    assert duplicate_event({"summary": "Vũ rời làng.", "chapter": 2}, [{"quote": "kiếm gãy"}], known) is None
    assert duplicate_event({"summary": "x", "chapter": 2, "supersedes_id": "e1"}, longer, known) is None
    assert can_rebase(["event", "event"]) and not can_rebase(["event", "entity"]) and not can_rebase([])
