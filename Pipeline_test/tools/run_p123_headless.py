"""Selected pipeline HTTP/DB/fake-provider helpers; provenance: dace9f9b."""
from __future__ import annotations

import argparse

import copy

import hashlib

import json

from pathlib import Path

import re

import secrets

import subprocess

import sys

import time

import uuid

import requests

ROOT = Path(__file__).resolve().parents[2]

sys.path.insert(0, str(ROOT))

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(",", ":"), default=str).encode()).hexdigest()

def sanitize(value):
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if any(s in k.lower() for s in
                ("password", "token", "secret", "cookie", "authorization")) else sanitize(v))
                for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    return value

class Probe:
    def __init__(self, env_file, output):
        self.env_file = Path(env_file).resolve()
        self.env = dict(line.split("=", 1) for line in self.env_file.read_text().splitlines()
                        if line and not line.startswith("#"))
        self.project = self.env["WAVE1D_PROJECT"]
        if not re.fullmatch(r"p123-core-[a-f0-9]{10}", self.project):
            raise ValueError("A fresh owned p123-core project is required")
        assert self.env["POSTGRES_DB"] == self.project.replace("-", "_")
        self.output = Path(output).resolve()
        self.output.mkdir(parents=True, exist_ok=False)
        self.compose = ["docker", "compose", "--env-file", str(self.env_file), "-f",
                        str(ROOT / "Pipeline_test/tools/compose.p123-headless.yml")]
        self.http = requests.Session()
        self.http.trust_env = False
        self.base = "http://127.0.0.1:" + self.env["WAVE1D_BACKEND_PORT"] + "/api/v1"
        self.checks = []
        self.stage = "preflight"
        self.novel = None
        self.source_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        self.source_dirty = bool(subprocess.check_output(["git", "status", "--porcelain", "--",
            "backend", "ai-service", "Pipeline_test/tools", "Pipeline_test/tests"], cwd=ROOT, text=True).strip())

    def save(self, name, value):
        (self.output / (name + ".json")).write_text(
            json.dumps(sanitize(value), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8", newline="\n")

    def command(self, args, *, stdin=None):
        result = subprocess.run(args, input=stdin, capture_output=True, text=True,
                                encoding="utf-8", errors="replace", timeout=90, cwd=ROOT)
        if result.returncode:
            raise RuntimeError("COMMAND_FAILED:" + " ".join(args[:4]) + ":" + result.stderr[-1500:])
        return result.stdout.strip()

    def sql(self, query):
        if not query.lstrip().lower().startswith("select "):
            raise ValueError("Diagnostic SQL must be SELECT")
        return self.command(self.compose + ["exec", "-T", "postgres", "psql", "-X", "-v",
            "ON_ERROR_STOP=1", "-U", self.env["POSTGRES_USER"], "-d", self.env["POSTGRES_DB"],
            "-At", "-c", query])

    def api(self, method, path, body=None, *, expected=(200, 201, 202), private=False, headers=None):
        response = self.http.request(method, self.base + path, json=body, headers=headers, timeout=65)
        try:
            data = response.json()
        except ValueError:
            data = {"non_json": response.text[:300]}
        if not private:
            with (self.output / "http-trace.jsonl").open("a", encoding="utf-8", newline="\n") as stream:
                stream.write(json.dumps(sanitize({"stage": self.stage, "method": method,
                    "path": path, "request": body, "status": response.status_code,
                    "response": data, "actor": "SIMULATED_HUMAN_VIA_API"}), ensure_ascii=False) + "\n")
        assert response.status_code in expected, f"HTTP_{response.status_code}:{method}:{path}:{sanitize(data)}"
        return data.get("data", data)

    def check(self, name, assertion, details=None):
        assert assertion, name
        self.checks.append({"name": name, "status": "PASS", "details": details})
        self.save("checks-progress", self.checks)

    def preflight(self):
        containers = json.loads(self.command(["docker", "inspect", *[
            self.project + "-" + s + "-1" for s in
            ("backend", "ai-service", "postgres", "mongodb", "budget-gateway", "fake-upstream")]]))
        networks = set()
        safe = []
        def service_name(c):return c['Config']['Labels']['com.docker.compose.service']
        for c in containers:
            assert c["Config"]["Labels"]["com.docker.compose.project"] == self.project
            assert c["State"]["Running"]
            networks.update(c["NetworkSettings"]["Networks"])
            safe.append({"name": c["Name"], "id": c["Id"], "image": c["Image"],
                         "networks": list(c["NetworkSettings"]["Networks"])})
            env = dict(v.split("=", 1) for v in c["Config"]["Env"] if "=" in v)
            for key in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY", "AI_LLM_API_KEY"):
                value=env.get(key)
                fake_key=(service_name(c)=='ai-service' and key=='OPENAI_API_KEY' and value==self.env['AI_WORKER_TOKEN'] and env.get('LLM_PROVIDER')=='openai' and env.get('LLM_BASE_URL')=='http://budget-gateway:18090/v1')
                assert not value or fake_key, "REAL_KEY_PRESENT"
            service = c["Config"]["Labels"]["com.docker.compose.service"]
            if service in {"backend", "ai-service"}:
                assert env["BUDGET_GUARD_MODE"] == "proxy"
                assert env["BUDGET_GUARD_URL"] == "http://budget-gateway:18090"
            if service == "ai-service":
                assert env["LLM_LOCAL_FALLBACK"] == "false"
                assert env["EMBEDDING_PROVIDER"] == "none"
                assert env["SEMANTIC_RETRIEVAL_ENABLED"] == "false"
            if service == "budget-gateway":
                assert env["OFFLINE_UPSTREAM_URL"] == "http://fake-upstream:18091"
        net_info = json.loads(self.command(["docker", "network", "inspect", *sorted(networks)]))
        assert all(n["Internal"] and n["Labels"]["com.docker.compose.project"] == self.project for n in net_info)
        identity = self.sql("select current_database()")
        assert identity == self.env["POSTGRES_DB"]
        self.save("containment", {"containers": safe, "internal_networks": sorted(networks),
            "database": identity, "real_provider_keys_absent": True, "fake_transport_key_only": True, "external_provider_calls": 0,
            "provider_route": "ai/backend -> budget-gateway -> fake-upstream on internal networks"})
        self.check("isolated_real_databases_fake_only", True)

    def account(self, suffix):
        name = self.project.replace("-", "_") + "_" + secrets.token_hex(3) + suffix
        password = "Core!" + secrets.token_hex(20)
        email = name + "@example.invalid"
        result = self.api("POST", "/auth/register", {"username": name, "email": email,
                         "password": password}, private=True)
        user = result["user"]["userId"]
        uuid.UUID(user)
        # Infrastructure-only role assignment to the just-created unique account.
        query = ("update users set role='AUTHOR' where user_id='" + user +
                 "' and email='" + email + "' and role='READER' returning user_id")
        setup = self.command(self.compose + ["exec", "-T", "postgres", "psql", "-X", "-v",
            "ON_ERROR_STOP=1", "-U", self.env["POSTGRES_USER"], "-d", self.env["POSTGRES_DB"],
            "-At", "-c", query])
        assert user in setup
        login = self.api("POST", "/auth/login", {"identifier": email, "password": password}, private=True)
        self.save("account-" + suffix, {"user_id": user, "role_fixture": "NEW_ACCOUNT_ONLY_AUTHOR",
                                      "business_actions": "SUPPORTED_AUTHENTICATED_HTTP"})
        return login["accessToken"], user

    def read_memory(self):
        return self.api("GET", self.brain + "/memory")

    def ledger(self):
        return json.loads(self.command(self.compose + ["exec", "-T", "budget-gateway", "python", "-c",
            "import urllib.request;print(urllib.request.urlopen('http://localhost:18090/health').read().decode())"] ))

    def review(self, review):
        raw = copy.deepcopy(review)
        self.save("machine-" + review["analysis_run_id"], raw)
        decisions = copy.deepcopy(review["decisions"])
        for d in decisions:
            if d["verdict"] == "unresolved":
                d.update(verdict="not_entity", canonical_name="", entity_type=None,
                         canonical_entity_id="", identity_quote="", initial_status="Unknown",
                         status_quote="", reason="SIMULATED_HUMAN_VIA_API rejects unresolved occurrence")
        before = self.read_memory()
        path = self.brain + "/entity-reviews/" + review["analysis_run_id"]
        frozen = self.api("POST", path + "/review", {"expected_version": review["review_version"],
                          "decisions": decisions})
        self.check("entity_review_not_canon_" + review["analysis_run_id"], self.read_memory() == before)
        self.save("human-" + review["analysis_run_id"], {"channel": "SIMULATED_HUMAN_VIA_API",
                                                       "frozen": frozen})
        return self.api("POST", path + "/continue", {})

    def approve(self):
        for _ in range(80):
            queue = self.api("GET", self.brain + "/review-queue")
            if not queue:
                return
            group_id = queue[0]["dependency_group_id"]
            group = [p for p in queue if p["dependency_group_id"] == group_id]
            summary = self.api("GET", "/ai/story-brains/by-novel/" + self.novel)
            self.api("POST", "/ai/proposal-groups/" + group_id + "/accept",
                {"expected_brain_version": summary["brain_version"],
                 "proposal_ids": [p["proposal_id"] for p in group],
                 "reason": "SIMULATED_HUMAN_VIA_API bounded scripted functional approval"})
        raise RuntimeError("CANON_QUEUE_NOT_DRAINED")

    def wait_job(self, job_id, terminal):
        deadline = time.monotonic() + 80
        while time.monotonic() < deadline:
            job = self.api("GET", "/ai/jobs/" + job_id)
            if job["status"] in terminal:
                return job
            assert job["status"] != "failed", "JOB_FAILED:" + str(job.get("error"))
            time.sleep(.4)
        raise RuntimeError("JOB_TIMEOUT:" + job_id)

    def wait_review(self, revision_id):
        deadline = time.monotonic() + 80
        while time.monotonic() < deadline:
            reviews = self.api("GET", self.brain + "/entity-reviews")
            pending = [v for v in reviews if v["revision_id"] == revision_id
                       and v["status"] == "waiting_entity_review"]
            if pending:
                return pending[0]
            time.sleep(.5)
        raise RuntimeError("ENTITY_GATE_TIMEOUT:" + revision_id)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    probe = Probe(args.env_file, args.output)
    failure = None
    try:
        probe.run()
    except Exception as exc:
        failure = {"type": type(exc).__name__, "message": str(exc) or "Exception without message"}
    finally:
        probe.save("validation", {"tested_source_sha": probe.source_sha,
            "source_dirty_at_start": probe.source_dirty,
            "project": probe.project, "novel_id": probe.novel, "stage": probe.stage,
            "checks": probe.checks, "failure": failure,
            "verdict": "P1_CORE_BLOCKED" if failure is not None else "P1_CORE_SLICE_READY_FOR_REVIEW",
            "P2_CORE": "NOT_RUN", "P3_CORE": "NOT_RUN", "UI": "BLOCKED_FE",
            "REAL_PROVIDER": "NOT_TESTED", "SEMANTIC_RAG": "NOT_ASSESSED", "P3_100K": "NOT_RUN"})
    print(json.dumps({"stage": probe.stage, "failure": failure, "checks_passed": len(probe.checks)}))
    return 1 if failure is not None else 0
