"""Add confirmed transitions, participants and rebuildable state projections."""
from alembic import op
from infrastructure.orm_models import EventParticipantRecord, StateTransitionRecord, CurrentEntityStateRecord

revision = "0002_state_projection"
down_revision = "0001_narrative_foundation"
branch_labels = None
depends_on = None

TABLES = (EventParticipantRecord.__table__, StateTransitionRecord.__table__, CurrentEntityStateRecord.__table__)


def upgrade():
    for table in TABLES:
        table.create(op.get_bind())


def downgrade():
    for table in reversed(TABLES):
        table.drop(op.get_bind())
