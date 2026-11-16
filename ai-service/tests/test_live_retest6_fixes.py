"""Live retest 6 (T1): outbox analysis must fail fast on a provider outage; the outbox retries later."""
import inspect

from core.structured_call import no_provider_retry_scope, provider_retries
from tests.test_live_retest5_fixes import guarded_call


def test_t1_outbox_analysis_does_not_retry_a_provider_outage_inside_the_call():
    with no_provider_retry_scope():
        message, calls = guarded_call("403 {'code': 'provider_timeout', 'upstream_status': 504}")
    assert message.startswith("PROVIDER_UNAVAILABLE") and calls == 1
    assert provider_retries.get() is True
    _, interactive_calls = guarded_call("403 {'code': 'provider_timeout', 'upstream_status': 504}")
    assert interactive_calls == 3


def test_t1_the_analysis_route_honours_the_outbox_retry_owner():
    from api.narrative_routes import analyze_revision
    source = inspect.getsource(analyze_revision)
    assert 'alias="X-Retry-Owner"' in source and 'retry_owner == "outbox"' in source
