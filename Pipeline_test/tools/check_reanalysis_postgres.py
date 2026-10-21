"""Synthetic recovery regressions; writes only to the explicitly isolated test database."""
import os
import uuid

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from tests import test_reanalysis_recovery as cases

url = os.environ['DATABASE_URL']
if (os.environ.get('EPHURIN_ALLOW_TEST_DB_MUTATIONS') != '1'
        or make_url(url).database != 'ephurin_report_e2e_canon_20261019'):
    raise SystemExit('Explicit isolated database and mutation opt-in required')
engine = create_engine(url)
with engine.connect() as connection:
    assert connection.scalar(text('select current_database()')) == 'ephurin_report_e2e_canon_20261019'
    assert connection.scalar(text('select version_num from alembic_version')) == '0010_fact_supersession'
checks = [(cases.test_two_reuse_claims_keep_one_canon_fact_and_both_review_decisions, ())]
checks.extend((cases.test_conflicting_claims_repair_before_persisting, (actions,)) for actions in [
    ('replace', 'replace'), ('reuse', 'replace'), ('replace', 'reuse')])
checks.append((cases.test_invalid_comparison_exhausts_bounded_repair_without_partial_canon, ()))
for test, args in checks:
    repository = PostgresNarrativeRepository(sessionmaker(bind=engine, expire_on_commit=False),
        tenant_id=str(uuid.uuid4()), actor_id=str(uuid.uuid4()))
    for name in ['Minh', 'Lan']:
        repository.upsert_entity('story', {'name': name, 'type': 'PER'})
    test(repository, *args)
    print('PASS', test.__name__, args)
engine.dispose()
print('5 real PostgreSQL recovery regressions passed. LLM outputs are stubs, not live-provider evidence.')
