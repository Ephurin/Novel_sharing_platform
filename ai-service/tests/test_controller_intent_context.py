import uuid
import pytest
from fastapi import HTTPException
from api.schemas import ControllerIntentRequest
from api.narrative_routes import _controller_intent_context

def test_request_actor_is_taken_from_trusted_header_not_json():
    header_actor = str(uuid.uuid4())
    intent = ControllerIntentRequest(generation_id=str(uuid.uuid4()), revision_id=str(uuid.uuid4()), actor_id=str(uuid.uuid4()))
    assert _controller_intent_context(intent, header_actor)['actor_id'] == header_actor

@pytest.mark.parametrize('actor', [None, 'not-an-actor'])
def test_missing_or_invalid_internal_actor_fails_closed(actor):
    intent = ControllerIntentRequest(generation_id=str(uuid.uuid4()), revision_id=str(uuid.uuid4()))
    with pytest.raises(HTTPException) as exc:
        _controller_intent_context(intent, actor)
    assert exc.value.status_code == 422

def test_malformed_uuid_cannot_reach_repository():
    intent = ControllerIntentRequest(generation_id='-'*36, revision_id=str(uuid.uuid4()))
    with pytest.raises(HTTPException):
        _controller_intent_context(intent, str(uuid.uuid4()))
