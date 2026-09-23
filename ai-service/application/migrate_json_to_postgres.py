"""Phase 8 JSON -> PostgreSQL cutover tool.

Dry-run is the default. Use --apply explicitly to mutate PostgreSQL.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.settings import Settings
from infrastructure.json_postgres_cutover import (
    CutoverMigrationError,
    JsonPostgresCutoverMigrator,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-storage", default="data")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--story-id", action="append", dest="story_ids")
    group.add_argument("--all", action="store_true")
    parser.add_argument("--apply", action="store_true", help="Apply migration; default is dry-run")
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--tenant-id", default=None)
    parser.add_argument("--actor-id", default=None)
    parser.add_argument("--output", default=None, help="Optional JSON report path")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    settings = Settings.from_env()
    database_url = args.database_url or settings.database_url
    if not database_url:
        raise SystemExit("DATABASE_URL/--database-url is required")

    engine = create_engine(database_url, pool_pre_ping=True)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    migrator = JsonPostgresCutoverMigrator(
        factory,
        tenant_id=args.tenant_id or settings.default_tenant_id,
        actor_id=args.actor_id or settings.default_actor_id,
        json_storage=args.json_storage,
    )
    story_ids = migrator.story_ids() if args.all else list(args.story_ids or [])
    if not story_ids:
        raise SystemExit("No JSON Story Brain files found")

    results = []
    exit_code = 0
    for story_id in story_ids:
        try:
            result = migrator.apply(story_id) if args.apply else migrator.plan(story_id)
        except (CutoverMigrationError, FileNotFoundError, ValueError) as exc:
            result = {
                "story_id": story_id,
                "mode": "apply" if args.apply else "dry-run",
                "action": "error",
                "safe_to_apply": False,
                "error": str(exc),
            }
            exit_code = 2
        else:
            if not result.get("safe_to_apply", False):
                exit_code = max(exit_code, 1)
        results.append(result)

    payload = {
        "tool": "phase8-json-postgres-cutover-v1",
        "mode": "apply" if args.apply else "dry-run",
        "json_storage": str(Path(args.json_storage)),
        "stories": results,
    }
    output = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    print(output)
    if args.output:
        Path(args.output).write_text(output + "\n", encoding="utf-8")
    engine.dispose()
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
