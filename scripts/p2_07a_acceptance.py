"""Run both real-stack journeys and publish only sanitized evidence."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True,
                        help="New directory outside the checkout")
    output = parser.parse_args().output.resolve()
    if output.is_relative_to(ROOT):
        parser.error("--output must be outside the checkout")
    output.mkdir()
    private = output / "private"
    evidence = output / "evidence"
    evidence.mkdir()
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip():
        parser.error("Run from a clean checkout to attest the exact source")
    parent = subprocess.check_output(["git", "rev-parse", "HEAD^"], cwd=ROOT, text=True).strip()
    receipt = {"sha": sha, "parent_sha": parent, "commands": [], "scenarios": {}}

    def run(command, env=None):
        result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True,
                                encoding="utf-8", errors="replace")
        receipt["commands"].append({"argv": command, "exit_code": result.returncode})
        return result

    def stage(name, *args):
        result = run([sys.executable, "scripts/p1_final_acceptance.py", name,
                      "--output", str(private), *args])
        if result.returncode:
            raise RuntimeError(f"{name} failed. See private harness logs.")

    try:
        stage("provision")
        stage("bridge-config", "--builtin-fake")
        for name in ("db-up", "up", "web-build", "runtime-proof"):
            stage(name)
        dist = ROOT / "web/dist"
        receipt["web_build_sha256"] = {
            path.relative_to(dist).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(dist.rglob("*")) if path.is_file()
        }
        project = json.loads((private / "private-stack.json").read_text())["project"]
        containers = run(
            ["docker", "ps", "--filter", f"label=com.docker.compose.project={project}",
             "--format", "{{.ID}}"])
        containers.check_returncode()
        images = run(["docker", "inspect", "--format", "{{.Name}} {{.Image}}", *containers.stdout.split()])
        images.check_returncode()
        receipt["container_images"] = images.stdout.splitlines()
        topology = json.loads((private / "runtime-topology.json").read_text())
        ai = topology["services"]["ai-service"]
        assert ai["providers"]["LLM_PROVIDER"] == "fake"
        assert ai["providers"]["LLM_BASE_URL"] == "http://127.0.0.1:9"
        assert ai["providers"]["LLM_FALLBACK_PROVIDER"] == "disabled"
        assert all(topology["networks"][name]["internal"] for name in ai["networks"])
        for scenario in ("S1", "S2"):
            result = run(["node", "--test", "--test-reporter=tap",
                          "web/tests/p2-07a-integrated.browser.test.mjs"], {
                **os.environ, "NODE_OPTIONS": "",
                "P207A_SCENARIO": scenario,
                "P1_ACCEPTANCE_CONFIG": str(private / "private-stack.json"),
                "P1_EVIDENCE_DIR": str(evidence / scenario),
            })
            counts = dict(re.findall(r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$",
                                     result.stdout, re.MULTILINE))
            receipt["scenarios"][scenario] = {"exit_code": result.returncode, "counts": counts}
        stage("provider-after")
        assert json.loads((private / "provider-after.log").read_text())["count"] == 0
        expected = {"tests": "1", "pass": "1", "fail": "0", "cancelled": "0",
                    "skipped": "0", "todo": "0"}
        for scenario, result in receipt["scenarios"].items():
            if result != {"exit_code": 0, "counts": expected}:
                raise RuntimeError(f"{scenario} did not execute and pass exactly one test: {result}")
            for name in ("http-counts.json", "http-requests-responses.json", "durable-readbacks.json",
                         "playwright-trace.zip", "screenshot-manifest.json"):
                assert (evidence / scenario / name).stat().st_size > 0
    finally:
        try:
            if (private / "private-stack.json").exists():
                stage("cleanup-owned")
                assert not (private / "cleanup-owned-containers-remaining.log").read_text().strip()
        finally:
            for name in ("commands-and-exits.jsonl", "runtime-topology.json", "provider-after.log",
                         "cleanup-only-owned-project.log", "cleanup-owned-containers-remaining.log"):
                if (private / name).exists():
                    shutil.copyfile(private / name, evidence / name)
            for trace in evidence.glob("*/trace.private.zip"):
                shutil.move(trace, private / f"{trace.parent.name}-trace.private.zip")
            (evidence / "gate-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
