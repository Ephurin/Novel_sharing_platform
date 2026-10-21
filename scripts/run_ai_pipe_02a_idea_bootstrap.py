#!/usr/bin/env python3
"""
Production Persistence Integration Runner for Gate AI-PIPE-02A.

Validates the Idea/Outline to Canonical Story Brain P2 adapter loop:
1. Author creates disposable novel fixture.
2. Bootstrap from Idea/Outline via Node API: POST /api/v1/ai/story-brains/bootstrap/from-idea.
3. Idempotent / repeatable bootstrap verification.
4. Review queue populated with structured proposals (premise, world rules, entities, constraints).
5. Author accepts proposal group via Node API -> entities & facts materialize in PostgreSQL.
6. Baseline activation via Node API -> Story Brain status reaches 'active' (version 2).
7. First canonical chapter and revision created and associated in PostgreSQL.
8. Direct PostgreSQL verification: narrative.entities, narrative.facts, narrative.story_brains (no parallel ad-hoc store).
9. Context preview retrieved via Node API: GET /api/v1/ai/story-brains/:novelId/context-preview.
10. Assisted AI generation via standard P1 route: POST /api/v1/ai/novels/:novelId/generate.
11. Canonical draft acceptance via Node API: POST /api/v1/chapters/:chapterId/revisions/accept-draft.
12. PostgreSQL persistence & Transactional Outbox: chapter_revisions, latest_revision_id, outbox COMPLETED -> brain advances version 2 -> 3.
13. Second context preview observes updated brain version (3), acceptance idempotency & author-control semantics hold.
14. Emits sanitized evidence to docs/development/AI-CORE-PIPELINE-VALIDATION-02/ai-pipe-02a-idea-bootstrap.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import psycopg

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def get_git_info() -> tuple[str, str]:
    try:
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        sha = os.getenv("GITHUB_SHA", "unknown").strip() or "unknown"

    branch = (os.getenv("GITHUB_HEAD_REF") or os.getenv("GITHUB_REF_NAME") or "").strip()
    if not branch:
        try:
            branch = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
        except Exception:
            branch = ""
    if not branch:
        branch = "detached-head"

    return sha, branch


def sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def run_pipeline(
    backend_url: str,
    ai_service_url: str,
    db_url: str,
    output_path: Path,
) -> dict[str, Any]:
    print("=" * 70)
    print("GATE AI-PIPE-02A: IDEA/OUTLINE -> STORY BRAIN INTEGRATION RUNNER")
    print(f"Backend URL:    {backend_url}")
    print(f"AI Service URL: {ai_service_url}")
    print(f"Database URL:   {db_url.split('@')[-1]}")
    print("=" * 70)

    git_sha, git_branch = get_git_info()

    # 1. Connect to PostgreSQL
    conn = psycopg.connect(db_url, autocommit=True)
    cur = conn.cursor()

    # 2. Authenticate as AUTHOR (reader03)
    login_url = f"{backend_url}/auth/login"
    login_res = httpx.post(
        login_url,
        json={"identifier": "reader03", "password": "StrongPassword123!"},
        timeout=15.0,
    )
    if login_res.status_code != 200:
        raise RuntimeError(f"Failed to authenticate as author reader03: {login_res.text}")
    auth_data = login_res.json()["data"]
    author_id = auth_data["user"]["userId"]
    token = auth_data["accessToken"]
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    print(f"[AUTH] Author authenticated: {author_id} (reader03)")

    checkpoints: list[dict[str, Any]] = []

    def record_cp(
        number: int,
        name: str,
        status: str,
        summary: str,
        details: dict[str, Any],
    ) -> None:
        cp = {
            "checkpoint": number,
            "name": name,
            "status": status,
            "summary": summary,
            "details": details,
        }
        checkpoints.append(cp)
        badge = "[PASS]" if status == "PASS" else "[FAIL]"
        print(f"{badge} Checkpoint {number:02d}: {name} -> {summary}")

    novel_id = None
    first_chapter_id = None

    try:
        # Fixture Setup: Author Novel
        cur.execute(
            """
            INSERT INTO novels (author_id, title, slug, synopsis)
            VALUES (%s, %s, %s, %s)
            RETURNING novel_id
            """,
            (
                author_id,
                f"Pipe 02A Novel {int(time.time())}",
                f"pipe-02a-{int(time.time())}",
                "Một tác phẩm thử nghiệm quy trình P2 khởi tạo từ ý tưởng.",
            ),
        )
        novel_id = str(cur.fetchone()[0])
        print(f"[FIXTURE] Created novel: {novel_id}")

        idea_text = "Một pháp sư mất trí nhớ điều tra cái chết của chính mình tại sa mạc huyền bí."
        outline_text = "Chương 1: Tỉnh dậy trên cồn cát. Chương 2: Cuộc hội ngộ với Dị Hỏa."

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 01: Idea Bootstrap Request via Node API
        # ─────────────────────────────────────────────────────────────────
        bootstrap_url = f"{backend_url}/ai/story-brains/bootstrap/from-idea"
        bs_payload = {
            "novel_id": novel_id,
            "idea": idea_text,
            "outline": outline_text,
            "locale": "vi-VN",
            "preferences": {
                "genre": ["fantasy", "mystery"],
                "tone": "dark",
                "target_length": "long_form",
            },
            "author_constraints": [
                "Không có du hành thời gian",
            ],
        }
        bs_res = httpx.post(bootstrap_url, json=bs_payload, headers=headers, timeout=20.0)
        assert bs_res.status_code == 202, f"Expected 202, got {bs_res.status_code}: {bs_res.text}"
        bs_body = bs_res.json()["data"]
        job_id = bs_body["job_id"]
        assert bs_body["status"] in ("waiting_review", "queued", "running")

        record_cp(
            1,
            "Idea Bootstrap Request via Node API",
            "PASS",
            f"Successfully queued idea bootstrap job {job_id}",
            {
                "novel_id": novel_id,
                "job_id": job_id,
                "status": bs_body["status"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 02: Idempotent / Repeatable Bootstrap Semantics
        # ─────────────────────────────────────────────────────────────────
        bs_res2 = httpx.post(bootstrap_url, json=bs_payload, headers=headers, timeout=20.0)
        assert bs_res2.status_code == 202, f"Expected 202, got {bs_res2.status_code}: {bs_res2.text}"
        job_id_2 = bs_res2.json()["data"]["job_id"]
        assert job_id_2 == job_id, f"Expected identical job_id {job_id}, got {job_id_2}"

        record_cp(
            2,
            "Repeatable Bootstrap Idempotency",
            "PASS",
            f"Repeated bootstrap request returned same job_id {job_id}",
            {"job_id_1": job_id, "job_id_2": job_id_2},
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 03: Structured Initial Proposals / Blueprint Populated
        # ─────────────────────────────────────────────────────────────────
        rq_url = f"{backend_url}/ai/story-brains/{novel_id}/review-queue"
        rq_res = httpx.get(rq_url, headers=headers, timeout=15.0)
        assert rq_res.status_code == 200, f"Expected 200, got {rq_res.status_code}: {rq_res.text}"
        proposals = rq_res.json()["data"]
        assert len(proposals) > 0, "Expected review queue to contain proposals"

        proposal_types = {p["proposal_type"] for p in proposals}
        assert "fact" in proposal_types, "Expected fact proposal (premise / world rule)"
        assert "entity" in proposal_types, "Expected entity proposals (characters / locations)"

        premise_prop = next(p for p in proposals if p["payload"].get("fact_type") == "premise")
        assert idea_text in premise_prop["payload"]["fact_value"]

        record_cp(
            3,
            "Structured Initial Proposals / Blueprint Populated",
            "PASS",
            f"Found {len(proposals)} proposals in review queue covering {list(proposal_types)}",
            {
                "proposal_count": len(proposals),
                "proposal_types": list(proposal_types),
                "premise_preview": premise_prop["payload"]["fact_value"][:60],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 04: Author Review & Proposal Acceptance
        # ─────────────────────────────────────────────────────────────────
        group_id = proposals[0]["dependency_group_id"]
        accept_grp_url = f"{backend_url}/ai/proposal-groups/{group_id}/accept"
        accept_grp_res = httpx.post(
            accept_grp_url,
            json={
                "proposal_ids": [p["proposal_id"] for p in proposals],
                "expected_brain_version": 1,
            },
            headers=headers,
            timeout=15.0,
        )
        assert accept_grp_res.status_code == 200, f"Expected 200, got {accept_grp_res.status_code}: {accept_grp_res.text}"
        grp_data = accept_grp_res.json()["data"]
        assert grp_data["brain_version"] == 2, f"Expected brain_version 2, got {grp_data['brain_version']}"

        record_cp(
            4,
            "Author Review & Proposal Acceptance",
            "PASS",
            f"Accepted {len(proposals)} proposals; Story Brain advanced to version 2",
            {
                "group_id": group_id,
                "accepted_count": len(proposals),
                "brain_version": grp_data["brain_version"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 05: Baseline Activation
        # ─────────────────────────────────────────────────────────────────
        act_url = f"{backend_url}/ai/story-brains/{novel_id}/baseline/activate"
        act_res = httpx.post(act_url, json={"job_id": job_id}, headers=headers, timeout=15.0)
        assert act_res.status_code == 200, f"Expected 200, got {act_res.status_code}: {act_res.text}"
        act_data = act_res.json()["data"]
        assert act_data["status"] == "active"

        record_cp(
            5,
            "Baseline Activation via Node API",
            "PASS",
            f"Story Brain status activated successfully (status={act_data['status']})",
            act_data,
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 06: First Canonical Chapter & Revision Association
        # ─────────────────────────────────────────────────────────────────
        chap1_content = (
            "Hải Ba Đông đứng trên cồn cát nhìn về phía chân trời xa xăm.\n"
            "Không khí khô nóng bao trùm khắp sa mạc hoang vắng."
        )
        chap1_hash = sha256(chap1_content)

        chap_create_url = f"{backend_url}/novels/{novel_id}/chapters"
        chap_res = httpx.post(
            chap_create_url,
            json={
                "title": "Chương 1: Tỉnh giấc trên cồn cát",
                "content": chap1_content,
                "isVip": False,
                "priceCoins": 0,
            },
            headers=headers,
            timeout=15.0,
        )
        assert chap_res.status_code == 201, f"Failed to create chapter 1: {chap_res.text}"
        first_chapter_id = chap_res.json()["data"]["chapterId"]

        # Create canonical base revision
        rev_create_url = f"{backend_url}/chapters/{first_chapter_id}/revisions/snapshot"
        rev_res = httpx.post(rev_create_url, json={"content": chap1_content}, headers=headers, timeout=15.0)
        assert rev_res.status_code == 201, f"Failed to create canonical revision: {rev_res.text}"
        base_rev_id = rev_res.json()["data"]["revisionId"]

        record_cp(
            6,
            "First Canonical Chapter & Revision Association",
            "PASS",
            f"Created chapter {first_chapter_id} with canonical base revision {base_rev_id}",
            {
                "chapter_id": first_chapter_id,
                "revision_id": base_rev_id,
                "content_hash": chap1_hash,
            },
        )

        # Stabilize the canonical snapshot's transactional outbox before
        # starting assisted generation. With fail-closed auto-materialization,
        # a manual snapshot may legitimately advance Story Brain asynchronously.
        base_snapshot_outbox_status = None
        for _ in range(30):
            cur.execute(
                """
                SELECT status FROM revision_outbox_events
                WHERE revision_id = %s AND event_type = 'INCREMENTAL_ANALYSIS'
                """,
                (base_rev_id,),
            )
            snapshot_outbox_row = cur.fetchone()
            if snapshot_outbox_row and snapshot_outbox_row[0] == "COMPLETED":
                base_snapshot_outbox_status = snapshot_outbox_row[0]
                break
            time.sleep(1.0)

        assert base_snapshot_outbox_status == "COMPLETED", (
            "Canonical snapshot incremental-analysis outbox did not complete"
        )
        cur.execute(
            "SELECT brain_version FROM narrative.story_brains WHERE novel_id = %s",
            (novel_id,),
        )
        writing_brain_version = int(cur.fetchone()[0])
        assert writing_brain_version >= 2, (
            f"Story Brain regressed below accepted bootstrap baseline: {writing_brain_version}"
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 07: Direct PostgreSQL Schema Assertions (No Ad-hoc Store)
        # ─────────────────────────────────────────────────────────────────
        cur.execute(
            """
            SELECT count(*) FROM narrative.entities WHERE novel_id = %s
            """,
            (novel_id,),
        )
        pg_ent_count = cur.fetchone()[0]

        cur.execute(
            """
            SELECT count(*) FROM narrative.facts WHERE novel_id = %s
            """,
            (novel_id,),
        )
        pg_fact_count = cur.fetchone()[0]

        cur.execute(
            """
            SELECT status, brain_version FROM narrative.story_brains WHERE novel_id = %s
            """,
            (novel_id,),
        )
        brain_row = cur.fetchone()
        assert brain_row is not None, "Story Brain record not found in PostgreSQL"
        assert brain_row[0] == "active"
        assert int(brain_row[1]) == writing_brain_version
        assert writing_brain_version >= 2
        assert pg_ent_count > 0, "Expected entities persisted in PostgreSQL"
        assert pg_fact_count > 0, "Expected facts persisted in PostgreSQL"

        record_cp(
            7,
            "Direct PostgreSQL Schema Verification",
            "PASS",
            f"Verified narrative schema: {pg_ent_count} entities, {pg_fact_count} facts, brain_version={writing_brain_version}",
            {
                "pg_entities": pg_ent_count,
                "pg_facts": pg_fact_count,
                "brain_status": brain_row[0],
                "brain_version": writing_brain_version,
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 08: Context Preview from the Initial Story Brain
        # ─────────────────────────────────────────────────────────────────
        ctx_url = f"{backend_url}/ai/story-brains/{novel_id}/context-preview?chapterId={first_chapter_id}"
        ctx_res = httpx.get(ctx_url, headers=headers, timeout=15.0)
        assert ctx_res.status_code == 200, f"Expected 200, got {ctx_res.status_code}: {ctx_res.text}"
        ctx_data = ctx_res.json()["data"]
        assert ctx_data["brain_version"] == writing_brain_version
        assert len(ctx_data["entities"]) > 0 or len(ctx_data["world_rules"]) > 0

        record_cp(
            8,
            "Context Preview from Active Initial Story Brain",
            "PASS",
            f"Context preview returned brain_version={ctx_data['brain_version']} with {len(ctx_data['entities'])} entities",
            {
                "brain_version": ctx_data["brain_version"],
                "entity_count": len(ctx_data["entities"]),
                "world_rules_count": len(ctx_data["world_rules"]),
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 09: Assisted Generation via Standard P1 Route
        # ─────────────────────────────────────────────────────────────────
        gen_url = f"{backend_url}/ai/writing/generations"
        gen_idempotency_key = f"gen-p2-{int(time.time())}-{uuid.uuid4()}"
        gen_payload = {
            "novel_id": novel_id,
            "chapter_id": first_chapter_id,
            "revision_id": base_rev_id,
            "content_hash": chap1_hash,
            "operation": "continue",
            "instruction": "Kael ngước nhìn bức tường Ashenhold đã sụp đổ, siết chặt thanh đoản kiếm rỉ sét.",
            "expected_brain_version": writing_brain_version,
            "selection": {"start": len(chap1_content), "end": len(chap1_content), "cursor": len(chap1_content)},
            "idempotency_key": gen_idempotency_key,
        }
        gen_res = httpx.post(gen_url, json=gen_payload, headers=headers, timeout=15.0)
        assert gen_res.status_code == 202, f"Generation failed: {gen_res.text}"
        gen_id = gen_res.json()["data"]["job_id"]

        gen_job_data: dict[str, Any] = {}
        for _ in range(30):
            j_res = httpx.get(f"{backend_url}/ai/jobs/{gen_id}", headers=headers, timeout=10.0)
            gen_job_data = j_res.json()["data"]
            if gen_job_data.get("status") in ("completed", "failed"):
                break
            time.sleep(1.0)

        assert gen_job_data.get("status") == "completed", f"Writing generation failed: {gen_job_data}"
        assert gen_job_data.get("validation_status") == "passed", f"Validations failed: {gen_job_data}"
        assert gen_job_data.get("patch") is not None

        record_cp(
            9,
            "Assisted AI Generation via Standard P1 Route",
            "PASS",
            f"Generated patch draft {gen_id} with status=completed, validation=passed",
            {
                "generation_id": gen_id,
                "status": gen_job_data["status"],
                "validation_status": gen_job_data["validation_status"],
                "patch": gen_job_data["patch"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 10: Canonical Draft Acceptance & PostgreSQL Persistence
        # ─────────────────────────────────────────────────────────────────
        accept_draft_url = f"{backend_url}/chapters/{first_chapter_id}/revisions/accept-draft"
        accept_draft_res = httpx.post(
            accept_draft_url,
            json={"generationId": gen_id},
            headers=headers,
            timeout=15.0,
        )
        assert accept_draft_res.status_code == 200, f"acceptDraft failed: {accept_draft_res.text}"
        accepted_rev = accept_draft_res.json()["data"]["revision"]
        accepted_rev_id = accepted_rev["revisionId"]

        # Direct PostgreSQL queries
        cur.execute(
            """
            SELECT revision_id, parent_revision_id, source_type, source_generation_id, content_hash
            FROM chapter_revisions
            WHERE revision_id = %s
            """,
            (accepted_rev_id,),
        )
        pg_rev = cur.fetchone()
        assert pg_rev is not None, "Accepted revision not found in PostgreSQL"
        assert pg_rev[2] == "AI_DRAFT_ACCEPT"
        assert pg_rev[3] == gen_id

        cur.execute(
            """
            SELECT latest_revision_id FROM chapters WHERE chapter_id = %s
            """,
            (first_chapter_id,),
        )
        pg_chap_latest = cur.fetchone()[0]
        assert str(pg_chap_latest) == accepted_rev_id

        record_cp(
            10,
            "Canonical Draft Acceptance & PostgreSQL Persistence",
            "PASS",
            f"Persisted revision {accepted_rev_id} with source_type=AI_DRAFT_ACCEPT in PostgreSQL",
            {
                "revision_id": accepted_rev_id,
                "parent_revision_id": str(pg_rev[1]),
                "source_type": pg_rev[2],
                "source_generation_id": pg_rev[3],
                "chapters_latest_revision_id": str(pg_chap_latest),
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 11: Transactional Outbox Dispatch & Incremental Story Brain Update
        # ─────────────────────────────────────────────────────────────────
        # Wait for outbox event to reach COMPLETED
        outbox_event_id = None
        outbox_terminal_status = None
        for _ in range(30):
            cur.execute(
                """
                SELECT event_id, status FROM revision_outbox_events
                WHERE revision_id = %s AND event_type = 'INCREMENTAL_ANALYSIS'
                """,
                (accepted_rev_id,),
            )
            outbox_row = cur.fetchone()
            if outbox_row:
                outbox_event_id = str(outbox_row[0])
                if outbox_row[1] == "COMPLETED":
                    outbox_terminal_status = outbox_row[1]
                    break
            time.sleep(1.0)

        assert outbox_event_id is not None, "INCREMENTAL_ANALYSIS outbox event not found"
        assert outbox_terminal_status == "COMPLETED", f"Outbox event did not complete: {outbox_row[1] if outbox_row else None}"

        # Fail-closed outbox semantics materialize all revision-scoped
        # proposals before the event can reach COMPLETED. Observe the resulting
        # canonical Story Brain directly instead of manually accepting pending
        # proposals in the validation runner.
        cur.execute(
            """
            SELECT brain_version FROM narrative.story_brains WHERE novel_id = %s
            """,
            (novel_id,),
        )
        updated_brain_ver = int(cur.fetchone()[0])
        assert updated_brain_ver > writing_brain_version, (
            "Accepted draft did not advance Story Brain after COMPLETED outbox: "
            f"{writing_brain_version} -> {updated_brain_ver}"
        )

        record_cp(
            11,
            "Transactional Outbox Dispatch & Incremental Story Brain Update",
            "PASS",
            f"Outbox event {outbox_event_id} dispatched; Story Brain reached version {updated_brain_ver}",
            {
                "outbox_event_id": outbox_event_id,
                "outbox_status": "COMPLETED",
                "brain_version_before": writing_brain_version,
                "story_brain_version": updated_brain_ver,
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 12: Second Context Preview Observes Updated Brain State
        # ─────────────────────────────────────────────────────────────────
        ctx2_res = httpx.get(ctx_url, headers=headers, timeout=15.0)
        assert ctx2_res.status_code == 200
        ctx2_data = ctx2_res.json()["data"]
        assert ctx2_data["brain_version"] == updated_brain_ver

        record_cp(
            12,
            "Second Context Preview Observes Updated Brain State",
            "PASS",
            f"Context preview successfully observed updated brain_version={updated_brain_ver}",
            {"brain_version": ctx2_data["brain_version"]},
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 13: Acceptance Idempotency & Author-Control Semantics
        # ─────────────────────────────────────────────────────────────────
        # 13a: Re-accepting the same generation must return existing revision without duplicate row
        retry_accept_res = httpx.post(
            accept_draft_url,
            json={"generationId": gen_id},
            headers=headers,
            timeout=15.0,
        )
        assert retry_accept_res.status_code == 200
        assert retry_accept_res.json()["data"]["revision"]["revisionId"] == accepted_rev_id

        cur.execute(
            """
            SELECT count(*) FROM chapter_revisions
            WHERE chapter_id = %s AND source_generation_id = %s
            """,
            (first_chapter_id, gen_id),
        )
        assert cur.fetchone()[0] == 1, "Expected exactly 1 revision row in PostgreSQL"

        # 13b: Create a second REAL writing generation and verify author-control safety when unaccepted
        cur.execute("SELECT latest_revision_id FROM chapters WHERE chapter_id = %s", (first_chapter_id,))
        latest_rev_before = str(cur.fetchone()[0])
        cur.execute("SELECT brain_version FROM narrative.story_brains WHERE novel_id = %s", (novel_id,))
        brain_ver_before = int(cur.fetchone()[0])

        # Get latest accepted revision hash and content length
        cur.execute("SELECT content_hash, content FROM chapter_revisions WHERE revision_id = %s", (accepted_rev_id,))
        acc_hash, acc_content = cur.fetchone()

        gen2_idempotency_key = f"gen-p2-unaccepted-{int(time.time())}-{uuid.uuid4()}"
        gen2_payload = {
            "novel_id": novel_id,
            "chapter_id": first_chapter_id,
            "revision_id": accepted_rev_id,
            "content_hash": acc_hash,
            "operation": "continue",
            "instruction": "Kael dừng lại và lắng nghe tiếng gió rít qua khe đá, không tiếp tục bước đi.",
            "expected_brain_version": brain_ver_before,
            "selection": {"start": len(acc_content), "end": len(acc_content), "cursor": len(acc_content)},
            "idempotency_key": gen2_idempotency_key,
        }
        gen2_res = httpx.post(gen_url, json=gen2_payload, headers=headers, timeout=15.0)
        assert gen2_res.status_code == 202, f"Second generation start failed: {gen2_res.text}"
        unaccepted_gen_id = gen2_res.json()["data"]["job_id"]

        gen2_job_data: dict[str, Any] = {}
        for _ in range(30):
            j2_res = httpx.get(f"{backend_url}/ai/jobs/{unaccepted_gen_id}", headers=headers, timeout=10.0)
            gen2_job_data = j2_res.json()["data"]
            if gen2_job_data.get("status") in ("completed", "failed"):
                break
            time.sleep(1.0)

        assert gen2_job_data.get("status") == "completed", f"Unaccepted generation failed: {gen2_job_data}"
        assert gen2_job_data.get("validation_status") == "passed"

        # Explicitly DO NOT call accept-draft
        # Verify chapter latest_revision_id is completely unchanged
        cur.execute("SELECT latest_revision_id FROM chapters WHERE chapter_id = %s", (first_chapter_id,))
        latest_rev_after = str(cur.fetchone()[0])
        assert latest_rev_after == latest_rev_before, (
            f"Canonical latest_revision_id was mutated without acceptDraft: {latest_rev_after} != {latest_rev_before}"
        )

        # Verify no chapter_revisions row exists for unaccepted_gen_id
        cur.execute(
            """
            SELECT count(*) FROM chapter_revisions WHERE source_generation_id = %s
            """,
            (unaccepted_gen_id,),
        )
        unacc_rev_count = cur.fetchone()[0]
        assert unacc_rev_count == 0, f"Expected 0 revision rows for unaccepted generation, found {unacc_rev_count}"

        # Verify Story Brain version has NOT advanced
        cur.execute("SELECT brain_version FROM narrative.story_brains WHERE novel_id = %s", (novel_id,))
        brain_ver_after = int(cur.fetchone()[0])
        assert brain_ver_after == brain_ver_before, (
            f"Story Brain was mutated by unaccepted generation: {brain_ver_after} != {brain_ver_before}"
        )

        record_cp(
            13,
            "Acceptance Idempotency & Author-Control Semantics",
            "PASS",
            "Retry acceptDraft returned existing revision with count=1; real unaccepted generation left canon and Story Brain untouched",
            {
                "accepted_revision_id": accepted_rev_id,
                "duplicate_row_count": 1,
                "unaccepted_generation_id": unaccepted_gen_id,
                "latest_revision_before": latest_rev_before,
                "latest_revision_after": latest_rev_after,
                "unaccepted_generation_revision_count": unacc_rev_count,
                "brain_version_before": brain_ver_before,
                "brain_version_after": brain_ver_after,
            },
        )

    finally:
        # Teardown disposable novel fixture
        if novel_id:
            try:
                cur.execute("DELETE FROM novels WHERE novel_id = %s", (novel_id,))
                print(f"[TEARDOWN] Deleted disposable novel {novel_id}")
            except Exception as e:
                print(f"[TEARDOWN] Cleanup error: {e}")
        cur.close()
        conn.close()

    evidence = {
        "gate": "AI-PIPE-02A",
        "pipeline": "P2",
        "verdict": "P2_IDEA_BOOTSTRAP_PASS",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "git_commit": git_sha,
        "git_branch": git_branch,
        "environment": {
            "backend_url": backend_url,
            "ai_service_url": ai_service_url,
            "database_backend": "postgresql-16+pgvector",
            "llm_provider": "fake-deterministic",
        },
        "summary": {
            "total_checkpoints": len(checkpoints),
            "passed": sum(1 for c in checkpoints if c["status"] == "PASS"),
            "failed": sum(1 for c in checkpoints if c["status"] == "FAIL"),
        },
        "checkpoints": checkpoints,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(evidence, f, indent=2, ensure_ascii=False)
    print(f"\n[EVIDENCE] Saved evidence artifact to {output_path}")

    return evidence


def main() -> None:
    parser = argparse.ArgumentParser(description="Run AI-PIPE-02A Idea Bootstrap Integration")
    parser.add_argument("--backend-url", default="http://localhost:4000/api/v1")
    parser.add_argument("--ai-service-url", default="http://localhost:8000")
    parser.add_argument(
        "--db-url",
        default="postgresql://postgres:postgres@localhost:5432/ephurin",
    )
    parser.add_argument(
        "--output",
        default="docs/development/AI-CORE-PIPELINE-VALIDATION-02/ai-pipe-02a-idea-bootstrap.json",
    )
    args = parser.parse_args()

    evidence = run_pipeline(
        backend_url=args.backend_url,
        ai_service_url=args.ai_service_url,
        db_url=args.db_url,
        output_path=Path(args.output),
    )

    passed = evidence["summary"]["passed"]
    total = evidence["summary"]["total_checkpoints"]
    failed = evidence["summary"]["failed"]
    print(f"\nResult: {passed}/{total} CHECKPOINTS PASSED ({failed} FAILED)")
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
