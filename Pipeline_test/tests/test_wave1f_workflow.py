"""Wave1F fake labels are source grounded and never a real-model recall score."""
import json,sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'ai-service'))
from Pipeline_test.tools.manuscript_fixture import parse_fixture_chapter
from Pipeline_test.tools.fake_wave1f_scenario import output
from core.structured_outputs import NarrativeEventOutput
from services.prose_facts import ProseFacts
from services.entity_pipeline.candidates import CandidateInventory
from services.entity_pipeline.verification import EntityDecisionBatch,_validate

@pytest.mark.parametrize('chapter',range(1,6))
def test_nonempty_fake_event_fact_quotes_match_immutable_chapter(chapter):
    body=parse_fixture_chapter(chapter)['body']
    events=output({'events':{}},'Text passage: '+body.strip()+'\nKnown entities: Linh\nExtract narrative events.')['events']
    assert events
    for raw in events:
        event=NarrativeEventOutput.model_validate(raw);assert event.evidence_quote in body
    facts=ProseFacts.model_validate(output({'facts':{}},'offline\n\n'+json.dumps({'source_text':body,'known_entities':[]})))
    assert facts.facts and all(f.quote in body for f in facts.facts)
    assert output({'facts':{}},'offline\n\n'+json.dumps({'source_text':body,'extracted':[]}))=={'facts':[]}
    if chapter==2:assert any(f.certainty=='reported' and f.fact_key=='unverified_voice_attribution' for f in facts.facts)

@pytest.mark.parametrize('chapter',range(1,6))
def test_entity_fake_respects_real_verifier_and_exact_candidate_ids(chapter):
    text=parse_fixture_chapter(chapter)['body'];inventory=CandidateInventory(text);inventory.collect(['Mai Linh','Linh','Duy','An','CV-04'])
    allowed=sorted({c.surface for c in inventory.items})
    request={'candidates':[c.to_dict() for c in inventory.items],'allowed_names':allowed,'known_entities':[]}
    result=output({'decisions':{}},'offline\n\n'+json.dumps(request))
    parsed=EntityDecisionBatch.model_validate(result)
    _validate(parsed.decisions,inventory.items,text,{},allowed)
    assert any(d.verdict=='entity' for d in parsed.decisions)
    assert {d.candidate_id for d in parsed.decisions}=={c.candidate_id for c in inventory.items}
