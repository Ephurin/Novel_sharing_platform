"""Run with python -m application.rebuild_projection NOVEL_ID --expected-brain-version N."""
import argparse
import json
import logging

from application.narrative_service import NarrativeApplicationService
from core.settings import Settings
from core.story_kb_manager import StoryKBManager
from infrastructure.repository_factory import build_narrative_repository


def main():
    parser = argparse.ArgumentParser(description="Rebuild state from confirmed facts and events")
    parser.add_argument("novel_id")
    parser.add_argument("--expected-brain-version", type=int, required=True)
    parser.add_argument("--json-storage", default="data")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    repository = build_narrative_repository(Settings.from_env(), StoryKBManager(args.json_storage))
    try:
        result = NarrativeApplicationService(repository).rebuild_projection(
            args.novel_id, args.expected_brain_version)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        if getattr(repository, "engine", None) is not None:
            repository.engine.dispose()


if __name__ == "__main__":
    main()
