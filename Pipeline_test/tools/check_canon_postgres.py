"""Run canon reconciliation repository regressions on an explicitly isolated PostgreSQL DB."""
import os
import uuid
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from tests import test_canon_revision_reconciliation as cases

url = os.environ['DATABASE_URL']
database = make_url(url).database
if os.environ.get('EPHURIN_ALLOW_TEST_DB_MUTATIONS') != '1' or database != 'ephurin_report_e2e_canon_20261019':
    raise SystemExit('Requires explicit isolated test DB and mutation opt-in')
engine = create_engine(url)
with engine.connect() as connection:
    assert connection.scalar(text('select current_database()')) == database
    assert connection.scalar(text('select version_num from alembic_version')) == '0010_fact_supersession'
for fn in [cases.test_review_reuses_same_occurrence_despite_summary_wording,
           cases.test_changes_create_explicit_versions_and_context_excludes_old_fact,
           cases.test_real_second_visit_is_not_collapsed_by_participants_or_action,
           cases.test_reconciliation_rejects_unknown_target_before_persistence,
           cases.test_retirement_keeps_history_and_removes_projected_state,
           cases.test_stale_reconciliation_cannot_insert_after_other_group_changes_canon,
           cases.test_replacement_retains_original_position_before_later_event,
           cases.test_retiring_status_fact_does_not_restore_obsolete_entity_default]:
    repository = PostgresNarrativeRepository(sessionmaker(bind=engine, expire_on_commit=False),
        tenant_id=str(uuid.uuid4()), actor_id=str(uuid.uuid4()))
    for name in ['Minh', 'Lan']:
        repository.upsert_entity('story', {'name': name, 'type': 'PER'})
    fn(repository)
    print('PASS', fn.__name__)
engine.dispose()
print('8 PostgreSQL repository regressions passed; synthetic records retained in isolated DB.')
