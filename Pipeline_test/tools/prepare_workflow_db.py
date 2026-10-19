"""Minimal relational regression fixture for hosts without pgvector. Not a migration runner."""
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ai-service"))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from infrastructure.orm_models import Base, StoryBrainRecord, StoryPlanRecord, StoryPlanObjectiveRecord, AutonomousRunRecord

url = os.environ["DATABASE_URL"]
name = make_url(url).database or ""
if os.environ.get("EPHURIN_ALLOW_TEST_DB_MUTATIONS") != "1" or not re.fullmatch(r"ephurin_report_e2e_workflow_[a-z0-9_]+", name):
    raise RuntimeError("Explicit opt-in and isolated workflow test database required")
engine = create_engine(url)
with engine.begin() as connection:
    connection.execute(text("CREATE SCHEMA IF NOT EXISTS narrative"))
    Base.metadata.create_all(connection, tables=[StoryBrainRecord.__table__, StoryPlanRecord.__table__,
                                               StoryPlanObjectiveRecord.__table__, AutonomousRunRecord.__table__])
engine.dispose()
print("Prepared minimal workflow regression fixture; full pgvector migration NOT assessed")
