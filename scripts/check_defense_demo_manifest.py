from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "docs" / "Deployment" / "defense-demo-manifest.json"

def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"Defense demo contract: FAIL - {message}")

def require_text(path: Path, snippets: list[str]) -> None:
    require(path.is_file(), f"missing required file: {path.relative_to(ROOT)}")
    text = path.read_text(encoding="utf-8")
    for snippet in snippets:
        require(snippet in text, f"{path.relative_to(ROOT)} does not contain required contract snippet: {snippet}")

def main() -> None:
    require(MANIFEST_PATH.is_file(), "defense-demo-manifest.json is missing")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    require(manifest.get("schema_version") == "1.0.0", "unexpected manifest schema version")
    require(manifest.get("purpose") == "graduation_defense_demo", "unexpected manifest purpose")

    baseline = manifest.get("baseline", {})
    require(bool(baseline.get("minimum_verified_main_commit")), "minimum verified commit is missing")
    require(
        baseline.get("final_demo_commit") == "TO_BE_PINNED_AFTER_UI_REFACTOR_AND_MANUAL_SANITY"
        or baseline.get("ui_freeze_pending") is False,
        "final demo commit must stay explicitly pending until UI freeze, or ui_freeze_pending must be false",
    )

    runtime = manifest.get("locked_runtime", {})
    require(runtime.get("generation_model") == "gemini-3.5-flash-lite", "generation model drifted")
    require(runtime.get("alternate_model_manual_only") == "gemini-3.1-flash-lite", "alternate model drifted")
    require(runtime.get("forbidden_automatic_fallback_model") == "gemini-3.8-flash", "3.8 fallback guard drifted")
    require(runtime.get("context_routing_policy") == "legacy-v1", "context routing policy drifted")
    require(runtime.get("python_local_fallback") is False, "Python local fallback must remain disabled")
    require(runtime.get("run_migrations") is True, "demo migrations must remain enabled")
    require(runtime.get("run_demo_seed") is True, "demo seed must remain enabled")

    compose_files = runtime.get("compose_files")
    require(compose_files == ["docker-compose.yml", "docker-compose.flash-lite-demo.yml"], "unexpected Compose file set")
    for compose_file in compose_files:
        require((ROOT / compose_file).is_file(), f"missing Compose file: {compose_file}")

    author = manifest.get("demo_identity", {}).get("author", {})
    require(author.get("username") == "reader03", "demo author username drifted")
    require(author.get("email") == "reader03@example.com", "demo author email drifted")
    require(author.get("role") == "AUTHOR", "demo author role drifted")

    story = manifest.get("demo_story", {})
    require(story.get("novel_id") == "81b923d7-5507-48ea-9a84-5303fd1de5f4", "primary defense novel ID drifted")
    chapter = story.get("primary_chapter", {})
    require(chapter.get("chapter_id") == "c660bede-0493-4a46-97f2-6d01c8ddd3db", "primary defense chapter ID drifted")
    require(chapter.get("expected_access") == "free", "primary defense chapter must remain a free chapter")

    require_text(
        ROOT / "docker-compose.flash-lite-demo.yml",
        [
            "LLM_MODEL: ${DEMO_LLM_MODEL:-gemini-3.5-flash-lite}",
            "AI_LLM_MODEL: ${DEMO_LLM_MODEL:-gemini-3.5-flash-lite}",
            'LLM_LOCAL_FALLBACK: "false"',
            "CONTEXT_ROUTING_POLICY: legacy-v1",
        ],
    )
    require_text(ROOT / "docker-compose.yml", ['RUN_MIGRATIONS: "true"', 'RUN_DEMO_SEED: "true"'])
    require_text(ROOT / "docs" / "Deployment" / "flash-lite-demo.env.example", ["DEMO_LLM_MODEL=gemini-3.5-flash-lite"])
    require_text(
        ROOT / "backend" / "src" / "scripts" / "seed-sample-stories.ts",
        ["reader03@example.com", "81b923d7-5507-48ea-9a84-5303fd1de5f4", "c660bede-0493-4a46-97f2-6d01c8ddd3db"],
    )
    require_text(
        ROOT / "docs" / "Deployment" / "defense-demo-runbook.md",
        ["docker-compose.flash-lite-demo.yml", "gemini-3.5-flash-lite", "reader03", "Ashenhold - Sample Story", "TO_BE_PINNED_AFTER_UI_REFACTOR_AND_MANUAL_SANITY"],
    )

    boundaries = manifest.get("acceptance_boundaries", {})
    require(boundaries.get("manual_ui_sanity_required_after_ui_refactor") is True, "manual final UI sanity must remain required")
    require(boundaries.get("destructive_p8_05_cleanup_allowed") is False, "P8-05 destructive cleanup cannot be authorized by demo manifest")

    print("Defense demo contract: PASS")
    print(f"  manifest: {MANIFEST_PATH.relative_to(ROOT)}")
    print(f"  model: {runtime['generation_model']}")
    print(f"  routing: {runtime['context_routing_policy']}")
    print(f"  author: {author['username']} / {author['role']}")
    print(f"  novel: {story['novel_id']}")
    print(f"  chapter: {chapter['chapter_id']}")
    print(f"  UI freeze pending: {baseline.get('ui_freeze_pending')}")

if __name__ == "__main__":
    main()
