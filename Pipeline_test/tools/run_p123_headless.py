"""Supported-API P1 core probe, with real isolated databases and fake provider only.

Never seeds narrative business rows. Only new-account AUTHOR role setup is SQL.
Each invocation needs a NEW output directory and creates new API-owned novel/accounts.
Infrastructure is retained for review; no historical resources are removed.
"""
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
from Pipeline_test.tools.manuscript_fixture import parse_fixture_chapter


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
        for c in containers:
            assert c["Config"]["Labels"]["com.docker.compose.project"] == self.project
            assert c["State"]["Running"]
            networks.update(c["NetworkSettings"]["Networks"])
            safe.append({"name": c["Name"], "id": c["Id"], "image": c["Image"],
                         "networks": list(c["NetworkSettings"]["Networks"])})
            env = dict(v.split("=", 1) for v in c["Config"]["Env"] if "=" in v)
            for key in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY", "AI_LLM_API_KEY"):
                assert not env.get(key), "REAL_KEY_PRESENT"
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
            "database": identity, "real_keys_empty": True, "external_provider_calls": 0,
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

    def restart_and_read(self):
        self.command(self.compose + ["restart", "ai-service", "backend"])
        for _ in range(70):
            try:
                return self.read_memory()
            except (requests.RequestException, AssertionError):
                time.sleep(.5)
        raise RuntimeError("RESTART_NOT_READY")

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

    def run(self):
        self.preflight()
        token, owner = self.account("owner")
        foreign, _ = self.account("foreign")
        self.http.headers["Authorization"] = "Bearer " + token
        self.stage = "five_chapter_source"
        novel = self.api("POST", "/novels", {"title": "Headless P1 " + self.project,
                         "synopsis": "Isolated source-grounded offline core functional probe."})
        self.novel = novel["novelId"]
        self.brain = "/ai/story-brains/" + self.novel
        manifest = []
        for i in range(1, 6):
            f = parse_fixture_chapter(i)
            c = self.api("POST", "/novels/" + self.novel + "/chapters",
                         {"title": f["title"], "content": f["body"]})
            self.api("POST", "/chapters/" + c["chapterId"] + "/revisions/snapshot",
                     {"purpose": "MANUSCRIPT_BOOTSTRAP"})
            revisions = self.api("GET", "/chapters/" + c["chapterId"] + "/revisions")
            r = self.api("GET", "/chapters/" + c["chapterId"] + "/revisions/" + revisions[0]["revisionId"])
            self.check("source_hash_ch" + str(i), r["contentHash"] == f["canonical_body_sha256"])
            manifest.append({**{k: v for k, v in f.items() if k != "body"},
                             "chapter_id": c["chapterId"], "revision_id": r["revisionId"],
                             "content_hash": r["contentHash"]})
        self.save("source-manifest", {"novel_id": self.novel, "owner_id": owner, "revisions": manifest})
        self.api("GET", self.brain + "/memory", headers={"Authorization": "Bearer " + foreign}, expected=(403,))
        self.check("same_novel_wrong_authenticated_author_denied", True)
        self.stage = "bootstrap_entity_canon"
        self.api("POST", self.brain + "/entity-guidance", {"expected_version": 0,
            "entries": [{"name": n} for n in ("Mai Linh", "Mai Lâm", "Duy", "CV-04", "Cồn Vân", "Đồi Bắc")]})
        started = self.api("POST", "/ai/story-brains/bootstrap/from-manuscript", {
            "novel_id": self.novel, "revisions": [{k: r[k] for k in
            ("chapter_id", "revision_id", "content_hash")} for r in manifest]})
        job_id = started["job_id"]
        initial = self.read_memory()
        for i, r in enumerate(manifest):
            job = self.wait_job(job_id, {"waiting_entity_review", "waiting_review"})
            assert job["status"] == "waiting_entity_review", "MISSING_ENTITY_GATE"
            review = self.wait_review(r["revision_id"])
            self.review(review)
            self.api("POST", "/ai/jobs/" + job_id + "/resume", {})
        self.wait_job(job_id, {"waiting_review"})
        self.check("canon_unchanged_until_approval", self.read_memory() == initial)
        self.save("M0-raw-queue", self.api("GET", self.brain + "/review-queue"))
        self.approve()
        self.api("POST", self.brain + "/baseline/activate", {"job_id": job_id})
        memory = self.read_memory()
        self.save("M0-approved-memory", memory)
        self.check("nonempty_approved_canon", bool(memory["entities"]) and bool(memory["events"]))
        for table in ("analysis_runs", "proposals", "revision_provenances", "entities", "events", "facts"):
            rows = self.sql("select coalesce(json_agg(t),'[]') from narrative." + table +
                            " t where novel_id='" + self.novel + "'")
            self.save("M0-db-" + table, json.loads(rows))
        self.stage = "durable_restart"
        db = self.sql("select row_to_json(s) from narrative.story_brains s where novel_id='" + self.novel + "'")
        self.save("M0-db-brain", json.loads(db))
        after = self.restart_and_read()
        self.check("approved_memory_survives_process_restart", memory == after)
        self.stage = "attached_future_plan"
        plan = self.api("POST", "/ai/story-plans", {"novel_id": self.novel,
            "source_outline": "Future intent only; not historical canon",
            "objectives": [{"order_index": 1, "title": "HEADLESS_FUTURE_PLAN",
                            "description": "Kiểm tra micro trước cửa Bốn; chưa thực hiện.", "target_chapter": 6}]})
        self.api("POST", "/ai/story-plans/" + plan["plan_id"] + "/activate", {"novel_id": self.novel})
        self.save("active-plan", self.api("GET", "/ai/story-plans/by-novel/" + self.novel + "/active"))
        self.check("attached_plan_not_historical_memory", self.read_memory() == after)
        self.stage = "outbound_generation"
        r = manifest[-1]
        summary = self.api("GET", "/ai/story-brains/by-novel/" + self.novel)
        instruction = "Headless " + uuid.uuid4().hex + ": tiếp tục theo dõi máy thu CV-04."
        generation = self.api("POST", "/ai/writing/generations", {"novel_id": self.novel,
            **{k: r[k] for k in ("chapter_id", "revision_id", "content_hash")},
            "operation": "continue", "selection": {"start": 0, "end": 0, "cursor": 0},
            "instruction": instruction, "expected_brain_version": summary["brain_version"]})
        done = self.wait_job(generation["job_id"], {"completed"})
        captures = self.http.get(self.base.removesuffix("/api/v1") + "/received", timeout=5).json()
        matching = [v for v in captures if instruction in v.get("prompt_text", "")]
        assert len(matching) == 1, "OUTBOUND_CORRELATION_FAILED"
        entry = matching[0]
        context = json.loads(entry["prompt_text"].split("Bối cảnh tiểu thuyết (Story Brain): ", 1)[1].split("\n", 1)[0])
        stored = json.loads(self.sql("select row_to_json(g) from narrative.writing_generations g where job_id='" + done["job_id"] + "'"))
        self.check("outbound_matches_durable_context_hash", digest(context) == stored["context_summary"]["context_hash"])
        self.save("outbound-capture", {"capture": entry, "stored_job": stored, "context": context,
            "full_prompt_hash": hashlib.sha256(entry["prompt_text"].encode()).hexdigest()})
        self.check("future_plan_attached_in_actual_outbound", context.get("planning_context", {}).get("plan_id") == plan["plan_id"])
        self.check("future_plan_not_outbound_historical_event", "HEADLESS_FUTURE_PLAN" not in json.dumps(context["recent_events"]))
        # These entities were actually approved from later immutable chapters.
        # Generate through the same backend path at chapter 1 to test real outbound cutoff.
        early = manifest[0]
        early_instruction = "Headless-cutoff-" + uuid.uuid4().hex + ": tiếp tục cảnh hiện tại."
        early_job = self.api("POST", "/ai/writing/generations", {"novel_id": self.novel,
            **{k: early[k] for k in ("chapter_id", "revision_id", "content_hash")},
            "instruction": early_instruction, "selection": {"start": 0, "end": 0, "cursor": 0},
            "expected_brain_version": summary["brain_version"]})
        early_done = self.wait_job(early_job["job_id"], {"completed"})
        entries = self.http.get(self.base.removesuffix("/api/v1") + "/received", timeout=5).json()
        early_entries = [e for e in entries if early_instruction in e.get("prompt_text", "")]
        assert len(early_entries) == 1, "EARLY_OUTBOUND_CORRELATION_FAILED"
        early_context = json.loads(early_entries[0]["prompt_text"].split("Bối cảnh tiểu thuyết (Story Brain): ", 1)[1].split("\n", 1)[0])
        early_stored = json.loads(self.sql("select row_to_json(g) from narrative.writing_generations g where job_id='" + early_done["job_id"] + "'"))
        self.save("outbound-cutoff-1", {"capture": early_entries[0], "context": early_context, "stored_job": early_stored})
        self.check("early_outbound_matches_durable_hash", digest(early_context) == early_stored["context_summary"]["context_hash"])
        later_names = {"Duy", "Nguyễn Vũ", "Vũ"}
        self.check("later_entities_actually_seeded_in_canon", later_names <= {e["name"] for e in after["entities"]})
        self.check("later_entities_excluded_from_early_outbound", not later_names & {e["name"] for e in early_context["entities"]})
        self.save("retrieval-and-budget", {"persisted_context_summary": stored["context_summary"],
            "semantic_retrieval_quality": "NOT_ASSESSED", "overflow_fault": "NOT_RUN",
            "future_entity_cutoff": "ACTUAL_CHAPTER_1_OUTBOUND_CHECKED", "locked_rule_stress": "NOT_RUN"})
        self.api("POST", "/ai/writing/generations", {"novel_id": self.novel,
            **{k: r[k] for k in ("chapter_id", "revision_id", "content_hash")},
            "expected_brain_version": summary["brain_version"] + 999}, expected=(409,))
        self.check("stale_brain_version_rejected", True)
        self.stage = "ordinary_save_outbox"
        previous = self.api("GET", "/chapters/" + r["chapter_id"])
        content = previous["draft"]["content"] + "\n\nMai Linh đặt một thẻ giấy ghi “kiểm tra micro” cạnh máy thu."
        saved = self.api("PATCH", "/chapters/" + r["chapter_id"], {"content": content, "autosave": True})
        self.save("ordinary-save", saved)
        self.check("ordinary_save_creates_revision", bool(saved.get("analysisRevisionId")))
        replay = self.api("PATCH", "/chapters/" + r["chapter_id"], {"content": content, "autosave": True})
        self.check("identical_save_reuses_immutable_revision", replay["analysisRevisionId"] == saved["analysisRevisionId"])
        self.api("POST", self.brain + "/reanalyse", {"revision_id": r["revision_id"]}, expected=(409,))
        self.check("stale_revision_reanalysis_rejected", True)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            reviews = self.api("GET", self.brain + "/entity-reviews")
            pending = [v for v in reviews if v["revision_id"] == saved["analysisRevisionId"] and v["status"] == "waiting_entity_review"]
            if pending:
                self.review(pending[0])
                break
            time.sleep(.5)
        else:
            raise RuntimeError("ORDINARY_SAVE_ENTITY_GATE_NOT_REACHED")
        self.approve()
        self.save("M-FIRST-approved-memory", self.read_memory())
        self.check("first_incremental_memory_changed", self.read_memory() != after)
        self.save("final-extraction-status", self.api("GET", self.brain + "/extraction-status"))
        outbox = json.loads(self.sql("select coalesce(json_agg(t),'[]') from revision_outbox_events t where novel_id='" + self.novel + "'"))
        self.save("M-FIRST-outbox", outbox)
        owned = [v for v in outbox if v["revision_id"] == saved["analysisRevisionId"] and v["event_type"] == "INCREMENTAL_ANALYSIS"]
        self.check("single_outbox_for_replayed_save", len(owned) == 1)
        self.check("outbox_completed", owned[0]["status"] == "COMPLETED")
        latest = self.read_memory()
        self.check("incremental_memory_survives_restart", self.restart_and_read() == latest)
        self.save("M-FIRST-db-revisions", json.loads(self.sql("select json_agg(t) from chapter_revisions t where novel_id='" + self.novel + "'")))
        self.save("gateway-ledger", self.ledger())
        self.stage = "bounded_slice_complete"


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


if __name__ == "__main__":
    raise SystemExit(main())
