"""Add story_plans and story_plan_objectives storage."""

from alembic import op

from infrastructure.orm_models import StoryPlanRecord, StoryPlanObjectiveRecord


revision = "0008_story_plans"
down_revision = "0007_semantic_memory_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    StoryPlanRecord.__table__.create(bind, checkfirst=True)
    StoryPlanObjectiveRecord.__table__.create(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    StoryPlanObjectiveRecord.__table__.drop(bind, checkfirst=True)
    StoryPlanRecord.__table__.drop(bind, checkfirst=True)
