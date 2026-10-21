"""Wave1E explicit mixed-verdict schema/grounding and parser edge cases."""
import json,sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'ai-service'))
from Pipeline_test.tools.fake_entity_scenario import mixed_decisions
from Pipeline_test.tools.manuscript_fixture import parse_fixture_chapter
from Pipeline_test.tools.provenance import verify_manuscript_gold_hashes
from Pipeline_test.tests.test_partial_import_idempotency import make_gold_chapters
from services.entity_pipeline.candidates import CandidateInventory
from services.entity_pipeline.verification import EntityDecisionBatch,_validate

def test_mixed_fake_decisions_obey_actual_schema_and_source_grounding():
    text=parse_fixture_chapter(1)['body'];inventory=CandidateInventory(text)
    inventory.collect(['Mai Linh','Linh','An','CV-04','Chiếc'])
    allowed=sorted({c.surface for c in inventory.items})
    request={'candidates':[c.to_dict() for c in inventory.items],'allowed_names':allowed}
    output=mixed_decisions(request); decisions=EntityDecisionBatch.model_validate(output).decisions
    _validate(decisions,inventory.items,text,{},allowed)
    assert {d.verdict for d in decisions}=={'entity','not_entity','unresolved'}
    assert any(d.identity_quote and d.canonical_name=='Mai Linh' for d in decisions)
    assert all(d.candidate_id in {c.candidate_id for c in inventory.items} for d in decisions)
    assert any(d.canonical_name=='CV-04' and d.entity_type=='ORG' for d in decisions) # deliberate author-correction case

@pytest.mark.parametrize('source',[
    '# Chương 1 —   \n\nVăn bản hợp lệ.\n',
    '# Chương 1 — Tiêu đề\n\n# Chương 1 — Trùng tiêu đề\n\nVăn bản.\n',
])
def test_empty_title_label_or_duplicate_leading_heading_rejected(tmp_path,source):
    (tmp_path/'ch01.md').write_text(source,encoding='utf-8')
    with pytest.raises(ValueError):parse_fixture_chapter(1,tmp_path)

def test_unknown_declared_normalization_fails_closed():
    chapters=make_gold_chapters();chapters[0]['conversion_rule_version']='unknown-v999'
    assert not verify_manuscript_gold_hashes(chapters,expected_novel_id='wave1d-novel',expected_owner_id='wave1d-author')[0]

def test_existing_browser_evidence_is_not_overwritten(tmp_path):
    from Pipeline_test.tools.browser_author_driver import BrowserActionSession
    sentinel=tmp_path/'browser-result.json';sentinel.write_text('historical')
    with pytest.raises(RuntimeError,match='REPLAY_FORBIDDEN'):BrowserActionSession('new',tmp_path)
    assert sentinel.read_text()=='historical'

@pytest.mark.parametrize('failure,human_review,human_result',[
    ('',False,None),
    (None,True,None),
    (None,True,{'status':'BLOCKED'}),
])
def test_missing_human_result_or_empty_assertion_error_cannot_pass(failure,human_review,human_result):
    from Pipeline_test.tools.browser_author_driver import browser_outcome
    assert browser_outcome(failure,[(True,'valid trace')],human_review=human_review,human_result=human_result).startswith('BLOCKED')
