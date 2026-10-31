"""
Runs the full local verification suite at the current checkout and writes a committed-friendly
evidence manifest: exact SHA, environment, command, exit code, duration and counts per step,
disposable database names, teardown, shared-database fingerprints, failures, and a small set of
screenshots.

Steps: web typecheck and unit tests, backend typecheck, the backend isolated suite when present
(PR #74), the refusal tests, and the browser/API runners on disposable stacks (social twice to
prove a safe rerun, discovery, the UI smoke matrix, SRS acceptance).

Usage (repo root, Windows):
  EPHURIN_E2E_DEMO_PASSWORD=... python scripts/run_e2e_evidence_suite.py --label pr73-head --out docs/development/PR73-REVIEW-R3/pr73-head
The runners need EPHURIN_ALLOW_TEST_DB_MUTATIONS=1; this script sets it for them and clears it for
the refusal tests. Stop the dev servers first: nobody may write to the shared database meanwhile.
"""

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any, Dict, List, Optional

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDGE_PATHS = [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]
SCREENSHOTS = {
    "smoke": ["375-dark-guest-author-from-public-novel.png", "375-light-reader-chapter-prose-sepia.png",
              "375-dark-reader-navigation.png", "390-light-author-writing-ide.png", "1440-light-guest-author-direct-url.png",
              "1440-dark-reader-chapter-prose-dark.png", "1440-light-admin-moderation.png", "1440-dark-author-own-public-profile.png"],
    "social": ["interact-e-preferences.png", "interact-f-comment-created.png"],
    "discovery": ["reader-e-chapter-reading.png"],
}


def run(command: str, cwd: str, env: Dict[str, str], log_path: str) -> Dict[str, Any]:
    started = time.time()
    result = subprocess.run(command, shell=True, cwd=cwd, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    output = result.stdout + "\n" + result.stderr
    with open(log_path, "w", encoding="utf-8") as handle:
        handle.write(output)
    passed = [int(m) for m in re.findall(r"^(?:ℹ|#) pass (\d+)", output, re.M)]
    failed = [int(m) for m in re.findall(r"^(?:ℹ|#) fail (\d+)", output, re.M)]
    skipped = [int(m) for m in re.findall(r"^(?:ℹ|#) skip(?:ped)? (\d+)", output, re.M)]
    unittest_ran = re.search(r"^Ran (\d+) tests?", output, re.M)
    evidence = re.findall(r"\(evidence: ([^)]+)\)", output)
    return {
        "command": command, "cwd": os.path.relpath(cwd, REPO_ROOT) or ".", "exit_code": result.returncode,
        "seconds": round(time.time() - started, 1),
        "tests_passed": sum(passed) if passed else None, "tests_failed": sum(failed) if failed else None,
        "tests_skipped": sum(skipped) if skipped else None,
        "unittest_ran": int(unittest_ran.group(1)) if unittest_ran else None,
        "unittest_ok": bool(re.search(r"^OK\b", output, re.M)) if unittest_ran else None,
        "evidence_dir": evidence[-1].strip() if evidence else None,
        "log": os.path.basename(log_path),
        "output_tail": redact(output[-1200:]),
    }


def redact(text: str) -> str:
    for path, label in ((tempfile.gettempdir(), "%TEMP%"), (os.path.expanduser("~"), "%USERPROFILE%"), (REPO_ROOT, "<repo>")):
        text = text.replace(path, label)
    return text


def tool_version(command: str) -> str:
    try:
        return subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30).stdout.strip().splitlines()[0]
    except Exception as error:
        return f"unavailable ({error})"


def environment(git: str) -> Dict[str, Any]:
    edge = next((path for path in EDGE_PATHS if os.path.exists(path)), None)
    edge_version = tool_version(f'powershell -NoProfile -Command "(Get-Item \'{edge}\').VersionInfo.ProductVersion"') if edge else "not installed"

    def git_out(args: str) -> str:
        return subprocess.run(f'"{git}" {args}', shell=True, capture_output=True, text=True, cwd=REPO_ROOT).stdout.strip()
    return {
        "os": f"{platform.system()} {platform.release()} ({platform.version()})",
        "python": platform.python_version(), "node": tool_version("node -v"), "npm": tool_version("npm -v"),
        "browser": f"Microsoft Edge {edge_version} (headless=new, CDP)",
        "postgres": tool_version('docker exec novel_sharing_platform-postgres-1 psql -U postgres -tAc "show server_version"'),
        "mongodb": tool_version('docker exec novel_sharing_platform-mongodb-1 mongosh --quiet --eval "db.version()"'),
        "git_sha": git_out("rev-parse HEAD"), "git_branch": git_out("rev-parse --abbrev-ref HEAD"),
        "git_dirty_tracked": bool(git_out("status --porcelain --untracked-files=no")),
        "origin_main_sha": git_out("rev-parse origin/main"),
    }


def load_evidence(step: Dict[str, Any], name: str) -> Optional[Dict[str, Any]]:
    folder = step.get("evidence_dir")
    if not folder or not os.path.isdir(folder):
        return None
    files = [f for f in os.listdir(folder) if f.endswith("-evidence.json")]
    if not files:
        return None
    with open(os.path.join(folder, files[0]), encoding="utf-8") as handle:
        data = json.load(handle)
    summary = {key: data.get(key) for key in ("verdict", "tested_code_sha", "working_tree_dirty", "disposable_database", "teardown_ok",
                                              "shared_fingerprint_before", "shared_fingerprint_after", "shared_changes", "failure",
                                              "checks_total", "checks_failed")}
    summary["db_ownership"] = data.get("db_ownership")
    if "checkpoints" in data:
        summary["checkpoints"] = {key: value.get("result") for key, value in data["checkpoints"].items()}
    if name == "srs":
        summary["results"] = [{k: r.get(k) for k in ("id", "title", "result", "detail")} for r in data.get("results", [])]
    if name == "smoke":
        failed = [r for r in data.get("results", []) if r.get("result") != "PASS"]
        summary["failed_checks"] = [{k: r.get(k) for k in ("combo", "role", "step", "problems")} for r in failed]
    return json.loads(redact(json.dumps(summary, ensure_ascii=False, default=str)))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--skip-browser", action="store_true", help="only static checks and refusal tests")
    args = parser.parse_args()
    if not os.environ.get("EPHURIN_E2E_DEMO_PASSWORD"):
        print("Missing EPHURIN_E2E_DEMO_PASSWORD")
        return 2

    git = os.environ.get("GIT_EXECUTABLE") or shutil.which("git") or "git"
    out_dir = os.path.abspath(args.out)
    logs_dir = os.path.join(tempfile.gettempdir(), "ephurin-e2e", f"suite-{args.label}")
    os.makedirs(os.path.join(out_dir, "screenshots"), exist_ok=True)
    os.makedirs(logs_dir, exist_ok=True)
    py = f'"{sys.executable}"'
    base_env = {**os.environ, "PYTHONIOENCODING": "utf-8", "GIT_EXECUTABLE": git}
    runner_env = {**base_env, "EPHURIN_ALLOW_TEST_DB_MUTATIONS": "1"}
    guard_env = {k: v for k, v in base_env.items() if k != "EPHURIN_ALLOW_TEST_DB_MUTATIONS"}
    web, backend = os.path.join(REPO_ROOT, "web"), os.path.join(REPO_ROOT, "backend")

    plan = [
        ("web_typecheck", "npm run typecheck", web, base_env),
        ("web_unit_tests", "node --test tests/contrast.test.mjs tests/color-scheme.test.mjs tests/project-sorting.test.mjs", web, base_env),
        ("web_wallet_test", "npm run test:wallet", web, base_env),
        ("backend_typecheck", "npm run typecheck", backend, base_env),
    ]
    if os.path.exists(os.path.join(web, "tests", "chapter-sorting.test.mjs")):
        plan.append(("web_chapter_sorting_test", "node --test tests/chapter-sorting.test.mjs", web, base_env))
    if os.path.exists(os.path.join(backend, "scripts", "run-isolated-tests.mjs")):
        plan.append(("backend_isolated_suite", "npm run test:isolated", backend, base_env))
    plan.append(("refusal_tests", f"{py} -m unittest scripts/test_e2e_isolated_stack.py -v", REPO_ROOT, guard_env))
    if not args.skip_browser:
        plan += [
            ("social_run_1", f"{py} scripts/run_reader_social_comment_preferences_e2e.py", REPO_ROOT, runner_env),
            ("social_run_2", f"{py} scripts/run_reader_social_comment_preferences_e2e.py", REPO_ROOT, runner_env),
            ("discovery_run", f"{py} scripts/run_reader_discovery_reading_state_e2e.py", REPO_ROOT, runner_env),
            ("smoke_matrix", f"{py} scripts/run_ui_smoke_matrix_e2e.py", REPO_ROOT, runner_env),
            ("srs_acceptance", f"{py} scripts/run_srs_acceptance_e2e.py", REPO_ROOT, runner_env),
        ]

    manifest: Dict[str, Any] = {"label": args.label, "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "environment": environment(git), "steps": []}
    print(json.dumps(manifest["environment"], indent=1))
    for name, command, cwd, env in plan:
        print(f"[suite] {name}: {command}")
        step = {"name": name, **run(command, cwd, env, os.path.join(logs_dir, f"{name}.log"))}
        kind = "srs" if name.startswith("srs") else "smoke" if name.startswith("smoke") else "social" if name.startswith("social") else "discovery" if name.startswith("discovery") else None
        if kind:
            step["evidence"] = load_evidence(step, kind)
            for shot in SCREENSHOTS.get(kind, []):
                source = os.path.join(step.get("evidence_dir") or "", shot)
                if os.path.exists(source) and name != "social_run_2":
                    shutil.copy2(source, os.path.join(out_dir, "screenshots", f"{kind}-{shot}"))
        step["evidence_dir"] = redact(step["evidence_dir"]) if step.get("evidence_dir") else None
        manifest["steps"].append(step)
        print(f"[suite]   exit={step['exit_code']} seconds={step['seconds']}")
    manifest["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    manifest["all_steps_exit_zero"] = all(step["exit_code"] == 0 for step in manifest["steps"])

    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, ensure_ascii=False)
    write_readme(manifest, os.path.join(out_dir, "README.md"))
    print(f"[suite] manifest written to {out_dir}")
    return 0 if manifest["all_steps_exit_zero"] else 1


def write_readme(manifest: Dict[str, Any], path: str) -> None:
    env = manifest["environment"]
    rows = []
    for step in manifest["steps"]:
        counts = []
        if step.get("tests_passed") is not None:
            counts.append(f"{step['tests_passed']} pass / {step.get('tests_failed') or 0} fail" + (f" / {step['tests_skipped']} skip" if step.get("tests_skipped") else ""))
        if step.get("unittest_ran") is not None:
            counts.append(f"{step['unittest_ran']} tests, {'OK' if step['unittest_ok'] else 'FAIL'}")
        evidence = step.get("evidence") or {}
        if evidence.get("checkpoints"):
            ok = sum(1 for value in evidence["checkpoints"].values() if value == "PASS")
            counts.append(f"{ok}/{len(evidence['checkpoints'])} checkpoints")
        if evidence.get("checks_total") is not None:
            counts.append(f"{evidence['checks_total'] - evidence['checks_failed']}/{evidence['checks_total']} checks")
        db = evidence.get("disposable_database")
        dropped = evidence.get("teardown_ok")
        shared = "unchanged" if evidence and not evidence.get("shared_changes") else (", ".join(evidence.get("shared_changes") or []) if evidence else "")
        rows.append(f"| `{step['name']}` | `{step['command'].replace(sys.executable, 'python')}` | {step['exit_code']} | {step['seconds']} | {'; '.join(counts)} | {f'`{db}`' if db else ''} | {'' if dropped is None else dropped} | {shared} |")
    fingerprints = sorted({(s['evidence'] or {}).get('shared_fingerprint_before', '')[:16] for s in manifest['steps'] if s.get('evidence')} - {''})
    srs = next((s.get("evidence") or {} for s in manifest["steps"] if s["name"] == "srs_acceptance"), {})
    srs_rows = "\n".join(f"| {r['id']} | {r['title']} | {r['result']} |" for r in srs.get("results", []))
    text = f"""# Evidence `{manifest['label']}`

- Source: `{env['git_sha']}` on `{env['git_branch']}` (tracked changes uncommitted: {env['git_dirty_tracked']}); `origin/main` at `{env['origin_main_sha']}`
- Started {manifest['started_at']}, finished {manifest['finished_at']}
- Environment: {env['os']}; Python {env['python']}; Node {env['node']}; npm {env['npm']}; {env['browser']}; PostgreSQL {env['postgres']}; MongoDB {env['mongodb']}
- Every step exit 0: **{manifest['all_steps_exit_zero']}**
- Shared database fingerprint (35 Postgres tables + Mongo collections of `ephurin`, before = after for every runner): {', '.join(f'`{f}`' for f in fingerprints) or 'n/a'}

Windows-only runners (taskkill, Microsoft Edge). Commands ran with `EPHURIN_ALLOW_TEST_DB_MUTATIONS=1` except the refusal tests; the demo password came from the seed file through `EPHURIN_E2E_DEMO_PASSWORD` and is not recorded.

| Step | Command | Exit | Seconds | Counts | Disposable DB | Dropped | Shared DB |
|---|---|---|---|---|---|---|---|
{chr(10).join(rows)}

Full per-step data, failures and output tails: `manifest.json`. Screenshots: `screenshots/`.

## SRS acceptance results

| ID | Test case | Result |
|---|---|---|
{srs_rows}
"""
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


if __name__ == "__main__":
    sys.exit(main())
