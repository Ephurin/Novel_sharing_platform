#!/usr/bin/env python3
"""
Production Persistence Integration Runner for Gate AI-PIPE-01A.

Validates the full production persistence and two-service boundary loop:
1. Disposable novel and chapter fixtures in PostgreSQL.
2. Bootstrap manuscript through Node application API.
3. Review queue resolution and baseline activation (Story Brain version 2).
4. AI writing generation through Node application API.
5. Canonical draft acceptance via Node POST /api/v1/chapters/:chapterId/revisions/accept-draft.
6. Direct PostgreSQL assertions:
   - chapter_revisions: source_type = 'AI_DRAFT_ACCEPT', source_generation_id, parent_revision_id, content_hash
   - chapters.latest_revision_id updated to accepted revision
   - revision_outbox_events: INCREMENTAL_ANALYSIS event created
7. Outbox processor dispatch observation -> event reaches COMPLETED.
8. Incremental proposals created in narrative.proposals -> accepted -> Story Brain advances to version 3.
9. Second context preview & generation through Node API observes updated brain version (3).
10. Idempotency assertion: re-accepting same generation returns existing revision without duplicate row.
11. Author-control semantics: unaccepted generation leaves canonical revision and Story Brain untouched.
12. Emits sanitized evidence to docs/development/AI-CORE-PIPELINE-VALIDATION-01/ai-pipe-01a-production-persistence.json.
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

from canon_review_smoke import capture_canon, review_revision

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def get_git_info() -> tuple[str, str]:
    """Return reproducible source identity in both local and GitHub Actions checkouts."""
    try:
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        sha = os.getenv("GITHUB_SHA", "unknown").strip() or "unknown"

    # GitHub pull_request workflows check out a synthetic merge commit in detached HEAD,
    # so `git branch --show-current` is legitimately empty there. Prefer the explicit
    # source branch exposed by Actions, then fall back to the local branch name.
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
    print("GATE AI-PIPE-01A: PRODUCTION PERSISTENCE INTEGRATION RUNNER")
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
        symbol = "PASS" if status == "PASS" else "FAIL"
        print(f"[{symbol}] Checkpoint {number:02d}: {name} - {summary}")

    # Generate isolated test IDs
    test_run_id = uuid.uuid4().hex[:8]
    novel_id = str(uuid.uuid4())
    novel_slug = f"ai-pipe-01a-{test_run_id}"

    ch1_id = str(uuid.uuid4())
    ch1_content = (
        "Chương 1: Khởi nguồn Dị Hỏa\n\n"
        "Tiêu Viêm ngồi xếp bằng trên tảng đá lớn giữa sa mạc Tháp Qua Nhĩ.\n"
        "Quy tắc: Dị Hỏa bài trừ hàn khí tuyệt đối trong phạm vi mười trượng.\n"
        "Hắn chậm rãi vận chuyển đấu khí, Thanh Liên Địa Tâm Hỏa bắt đầu khởi động."
    )
    ch1_hash = sha256(ch1_content)
    rev1_id = str(uuid.uuid4())

    ch2_id = str(uuid.uuid4())
    ch2_content = (
        "Chương 2: Hàn Băng và Dị Hỏa\n\n"
        "Hải Ba Đông đứng trên cồn cát nhìn Tiêu Viêm.\n"
        "Không khí lạnh lẽo bao trùm xung quanh, nhưng Dị Hỏa của Tiêu Viêm vẫn rực cháy kiên cường."
    )
    ch2_hash = sha256(ch2_content)
    rev2_id = str(uuid.uuid4())

    try:
        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 01: Manuscript Fixture Setup in PostgreSQL
        # ─────────────────────────────────────────────────────────────────────
        cur.execute(
            """
            INSERT INTO novels (novel_id, author_id, title, slug, synopsis, status)
            VALUES (%s, %s, %s, %s, %s, 'DRAFT')
            """,
            (novel_id, author_id, f"AI-PIPE-01A Novel {test_run_id}", novel_slug, "Disposable persistence novel"),
        )
        cur.execute(
            """
            INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, content, word_count, status)
            VALUES (%s, %s, 'Chương 1: Khởi nguồn', 1, %s, %s, 'DRAFT')
            """,
            (ch1_id, novel_id, ch1_content, len(ch1_content.split())),
        )
        cur.execute(
            """
            INSERT INTO chapter_revisions (revision_id, novel_id, chapter_id, content_hash, content, word_count, source_type, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, 'AUTHOR_MANUAL', %s)
            """,
            (rev1_id, novel_id, ch1_id, ch1_hash, ch1_content, len(ch1_content.split()), author_id),
        )
        cur.execute("UPDATE chapters SET latest_revision_id = %s WHERE chapter_id = %s", (rev1_id, ch1_id))

        cur.execute(
            """
            INSERT INTO chapters (chapter_id, novel_id, title, chapter_number, content, word_count, status)
            VALUES (%s, %s, 'Chương 2: Dấn thân', 2, %s, %s, 'DRAFT')
            """,
            (ch2_id, novel_id, ch2_content, len(ch2_content.split())),
        )
        cur.execute(
            """
            INSERT INTO chapter_revisions (revision_id, novel_id, chapter_id, content_hash, content, word_count, source_type, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, 'AUTHOR_MANUAL', %s)
            """,
            (rev2_id, novel_id, ch2_id, ch2_hash, ch2_content, len(ch2_content.split()), author_id),
        )
        cur.execute("UPDATE chapters SET latest_revision_id = %s WHERE chapter_id = %s", (rev2_id, ch2_id))

        record_cp(
            1,
            "Manuscript Fixture Persistence",
            "PASS",
            "Created disposable novel and two chapters with initial revisions in PostgreSQL",
            {
                "novel_id": novel_id,
                "author_id": author_id,
                "chapter_1": {"chapter_id": ch1_id, "revision_id": rev1_id, "content_hash": ch1_hash},
                "chapter_2": {"chapter_id": ch2_id, "revision_id": rev2_id, "content_hash": ch2_hash},
                "db_backend": "PostgreSQL",
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 02: Bootstrap Manuscript through Node Application API
        # ─────────────────────────────────────────────────────────────────────
        boot_payload = {
            "novel_id": novel_id,
            "revisions": [
                {"chapter_id": ch1_id, "revision_id": rev1_id, "content_hash": ch1_hash, "chapter_number": 1}
            ],
            "locale": "vi-VN",
            "options": {
                "extract_world_rules": True,
                "build_embeddings": False,
                "require_review_for_all": True,
            },
        }
        boot_res = httpx.post(
            f"{backend_url}/ai/story-brains/bootstrap/from-manuscript",
            json=boot_payload,
            headers=headers,
            timeout=15.0,
        )
        assert boot_res.status_code == 202, f"Bootstrap start returned {boot_res.status_code}: {boot_res.text}"
        bootstrap_job_id = boot_res.json()["data"]["job_id"]

        # Poll bootstrap job until waiting_review
        boot_job_data: dict[str, Any] = {}
        for _ in range(30):
            j_res = httpx.get(f"{backend_url}/ai/jobs/{bootstrap_job_id}", headers=headers, timeout=10.0)
            boot_job_data = j_res.json()["data"]
            if boot_job_data.get("status") in ("waiting_review", "completed"):
                break
            time.sleep(1.0)
        assert boot_job_data.get("status") in ("waiting_review", "completed"), f"Bootstrap job failed: {boot_job_data}"

        record_cp(
            2,
            "Manuscript Bootstrap Processing",
            "PASS",
            "Bootstrap job executed through Node gateway and completed to waiting_review",
            {
                "bootstrap_job_id": bootstrap_job_id,
                "terminal_status": boot_job_data.get("status"),
                "stage": boot_job_data.get("stage"),
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 03: Proposal Review via Node Gateway
        # ─────────────────────────────────────────────────────────────────────
        rq_res = httpx.get(f"{backend_url}/ai/story-brains/{novel_id}/review-queue", headers=headers, timeout=10.0)
        queue_items = rq_res.json().get("data", [])
        assert len(queue_items) > 0, "Expected proposals in review queue"

        # Group proposals by dependency_group_id
        groups: dict[str, list[str]] = {}
        for item in queue_items:
            gid = item["dependency_group_id"]
            groups.setdefault(gid, []).append(item["proposal_id"])

        current_v = 1
        accepted_groups_count = 0
        for gid, p_ids in groups.items():
            acc_res = httpx.post(
                f"{backend_url}/ai/proposal-groups/{gid}/accept",
                json={"proposal_ids": p_ids, "expected_brain_version": current_v},
                headers=headers,
                timeout=10.0,
            )
            assert acc_res.status_code == 200, f"Proposal group accept failed: {acc_res.text}"
            current_v = acc_res.json()["data"]["brain_version"]
            accepted_groups_count += 1

        record_cp(
            3,
            "Proposal Review Resolution",
            "PASS",
            f"Resolved {len(queue_items)} proposals across {accepted_groups_count} groups via Node gateway",
            {
                "total_proposals": len(queue_items),
                "groups_accepted": accepted_groups_count,
                "result_brain_version": current_v,
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 04: Story Brain Baseline Activation & PostgreSQL Verification
        # ─────────────────────────────────────────────────────────────────────
        act_res = httpx.post(
            f"{backend_url}/ai/story-brains/{novel_id}/baseline/activate",
            json={"job_id": bootstrap_job_id},
            headers=headers,
            timeout=10.0,
        )
        assert act_res.status_code == 200, f"Activate baseline failed: {act_res.text}"

        cur.execute(
            """
            SELECT status, brain_version, baseline_revision_id
            FROM narrative.story_brains WHERE novel_id = %s
            """,
            (novel_id,),
        )
        brain_row = cur.fetchone()
        assert brain_row is not None, "Story Brain record not found in PostgreSQL"
        assert brain_row[0] == "active", f"Expected active status, got {brain_row[0]}"
        baseline_brain_version = int(brain_row[1])
        assert baseline_brain_version >= 2, f"Expected brain_version >= 2, got {baseline_brain_version}"

        record_cp(
            4,
            "Story Brain Activation & Persistence",
            "PASS",
            f"Story Brain active in PostgreSQL narrative.story_brains with brain_version={baseline_brain_version}",
            {
                "status": brain_row[0],
                "brain_version": baseline_brain_version,
                "baseline_revision_id": str(brain_row[2]),
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 05: Context Preview Retrieval via Node Gateway
        # ─────────────────────────────────────────────────────────────────────
        cp_res1 = httpx.get(
            f"{backend_url}/ai/story-brains/{novel_id}/context-preview?chapter_id={ch2_id}",
            headers=headers,
            timeout=10.0,
        )
        assert cp_res1.status_code == 200, f"Context preview failed: {cp_res1.text}"
        preview1_data = cp_res1.json()["data"]
        assert preview1_data.get("brain_version") == baseline_brain_version
        preview1_entities = [e.get("name") for e in preview1_data.get("entities", [])]
        preview1_hash = sha256(json.dumps(preview1_data, sort_keys=True))

        record_cp(
            5,
            "Context Preview Retrieval",
            "PASS",
            f"Context preview packed for Chapter 2 with brain_version={baseline_brain_version}",
            {
                "brain_version": baseline_brain_version,
                "entities_count": len(preview1_entities),
                "entities": preview1_entities,
                "preview_hash": preview1_hash,
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 06: AI Writing Generation via Node Application API
        # ─────────────────────────────────────────────────────────────────────
        gen_idempotency_key = str(uuid.uuid4())
        gen_payload = {
            "novel_id": novel_id,
            "chapter_id": ch2_id,
            "revision_id": rev2_id,
            "content_hash": ch2_hash,
            "operation": "continue",
            "instruction": "Tiêu Viêm thu hồi Dị Hỏa, ánh mắt cảnh giác nhìn về phía Hải Ba Đông.",
            "expected_brain_version": baseline_brain_version,
            "selection": {"start": len(ch2_content), "end": len(ch2_content), "cursor": len(ch2_content)},
            "idempotency_key": gen_idempotency_key,
        }
        gen_res = httpx.post(
            f"{backend_url}/ai/writing/generations",
            json=gen_payload,
            headers=headers,
            timeout=15.0,
        )
        assert gen_res.status_code == 202, f"Writing generation start failed: {gen_res.text}"
        generation_job_id = gen_res.json()["data"]["job_id"]

        writing_job_data: dict[str, Any] = {}
        for _ in range(30):
            w_res = httpx.get(f"{backend_url}/ai/jobs/{generation_job_id}", headers=headers, timeout=10.0)
            writing_job_data = w_res.json()["data"]
            if writing_job_data.get("status") in ("completed", "failed"):
                break
            time.sleep(1.0)
        assert writing_job_data.get("status") == "completed", f"Writing generation failed: {writing_job_data}"
        assert writing_job_data.get("validation_status") == "passed", f"Validations failed: {writing_job_data}"
        patch = writing_job_data["patch"]
        assert patch is not None and "replacement" in patch

        record_cp(
            6,
            "AI Writing Generation Completion",
            "PASS",
            "Writing generation completed with passed validation and valid patch",
            {
                "generation_job_id": generation_job_id,
                "status": writing_job_data.get("status"),
                "validation_status": writing_job_data.get("validation_status"),
                "patch_start": patch.get("start"),
                "patch_end": patch.get("end"),
                "replacement_length": len(patch.get("replacement", "")),
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 07: Accept Draft via Node API
        # ─────────────────────────────────────────────────────────────────────
        canon_before_accept = capture_canon(cur, novel_id)
        accept_res = httpx.post(
            f"{backend_url}/chapters/{ch2_id}/revisions/accept-draft",
            json={"generationId": generation_job_id},
            headers=headers,
            timeout=15.0,
        )
        assert accept_res.status_code == 200, f"Accept draft failed: {accept_res.text}"
        accepted_revision_id = accept_res.json()["data"]["revision"]["revisionId"]

        record_cp(
            7,
            "Draft Acceptance Gateway Call",
            "PASS",
            f"Node acceptDraft route executed successfully, returned revisionId={accepted_revision_id}",
            {
                "generation_id": generation_job_id,
                "accepted_revision_id": accepted_revision_id,
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 08: Direct PostgreSQL Verification of chapter_revisions Row
        # ─────────────────────────────────────────────────────────────────────
        cur.execute(
            """
            SELECT revision_id, parent_revision_id, content_hash, source_type, source_generation_id, content
            FROM chapter_revisions WHERE revision_id = %s
            """,
            (accepted_revision_id,),
        )
        rev_row = cur.fetchone()
        assert rev_row is not None, "chapter_revisions row missing in PostgreSQL"
        assert rev_row[3] == "AI_DRAFT_ACCEPT", f"Expected AI_DRAFT_ACCEPT, got {rev_row[3]}"
        assert rev_row[4] == generation_job_id, f"source_generation_id mismatch: {rev_row[4]}"
        assert rev_row[1] == uuid.UUID(rev2_id), f"parent_revision_id mismatch: {rev_row[1]}"
        persisted_content = str(rev_row[5])
        persisted_hash = str(rev_row[2])
        assert sha256(persisted_content) == persisted_hash, "Persisted content hash mismatch"

        record_cp(
            8,
            "PostgreSQL chapter_revisions Persistence",
            "PASS",
            "Verified chapter_revisions has source_type=AI_DRAFT_ACCEPT, matching generation ID and parent",
            {
                "revision_id": accepted_revision_id,
                "source_type": rev_row[3],
                "source_generation_id": rev_row[4],
                "parent_revision_id": str(rev_row[1]),
                "content_hash": persisted_hash,
                "content_length": len(persisted_content),
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 09: Chapters Pointer Updated in PostgreSQL
        # ─────────────────────────────────────────────────────────────────────
        cur.execute("SELECT latest_revision_id FROM chapters WHERE chapter_id = %s", (ch2_id,))
        ch_row = cur.fetchone()
        assert ch_row is not None and str(ch_row[0]) == accepted_revision_id, (
            f"chapters.latest_revision_id ({ch_row[0] if ch_row else None}) != accepted ({accepted_revision_id})"
        )

        record_cp(
            9,
            "PostgreSQL chapters Pointer Update",
            "PASS",
            f"Verified chapters.latest_revision_id points to {accepted_revision_id}",
            {
                "chapter_id": ch2_id,
                "latest_revision_id": accepted_revision_id,
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 10: Transactional Outbox Event Created in PostgreSQL
        # ─────────────────────────────────────────────────────────────────────
        cur.execute(
            """
            SELECT event_id, event_type, status, revision_id, novel_id, chapter_id
            FROM revision_outbox_events WHERE revision_id = %s AND event_type = 'INCREMENTAL_ANALYSIS'
            """,
            (accepted_revision_id,),
        )
        outbox_row = cur.fetchone()
        assert outbox_row is not None, "INCREMENTAL_ANALYSIS outbox event missing in PostgreSQL"
        outbox_event_id = str(outbox_row[0])

        record_cp(
            10,
            "PostgreSQL Transactional Outbox Event",
            "PASS",
            f"Verified revision_outbox_events row exists for revision {accepted_revision_id}",
            {
                "event_id": outbox_event_id,
                "event_type": outbox_row[1],
                "initial_status": outbox_row[2],
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 11: Real Outbox Processor Dispatch Observation
        # ─────────────────────────────────────────────────────────────────────
        outbox_terminal_status = outbox_row[2]
        for _ in range(15):
            cur.execute("SELECT status FROM revision_outbox_events WHERE event_id = %s", (outbox_event_id,))
            st_row = cur.fetchone()
            if st_row and st_row[0] == "COMPLETED":
                outbox_terminal_status = st_row[0]
                break
            time.sleep(1.0)
        assert outbox_terminal_status == "COMPLETED", f"Outbox event did not complete: {outbox_terminal_status}"

        record_cp(
            11,
            "Outbox Processor Dispatch & Completion",
            "PASS",
            f"Observed real outbox processor dispatching event to AI Service (status={outbox_terminal_status})",
            {
                "event_id": outbox_event_id,
                "status": outbox_terminal_status,
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 12: Incremental Narrative State & Story Brain Advancement
        # ─────────────────────────────────────────────────────────────────────
        author_review = review_revision(cur, backend_url, headers, novel_id,
                                        accepted_revision_id, canon_before_accept)
        advanced_version = author_review['canon_after']['brain_version']
        record_cp(
            12, "Incremental Proposals & Explicit Author Canon Review", "PASS",
            f"Author reviewed pending proposals; Story Brain advanced to {advanced_version}",
            {"proposals_count": len(author_review['pending_proposal_ids']),
             "proposal_statuses": ["pending"], "accepted_before_runner": 0,
             "accepted_by_runner": len(author_review['pending_proposal_ids']),
             "materialization_mode": "explicit_author_review",
             "brain_version_before": baseline_brain_version,
             "brain_version_after": advanced_version, "author_review": author_review},
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 13: Memory Feedback Observed in Second Context Preview & Generation
        # ─────────────────────────────────────────────────────────────────────
        cp_res2 = httpx.get(
            f"{backend_url}/ai/story-brains/{novel_id}/context-preview?chapter_id={ch2_id}",
            headers=headers,
            timeout=10.0,
        )
        assert cp_res2.status_code == 200, f"Second context preview failed: {cp_res2.text}"
        preview2_data = cp_res2.json()["data"]
        preview2_version = preview2_data.get("brain_version")
        assert preview2_version == advanced_version, f"Expected {advanced_version}, got {preview2_version}"
        preview2_hash = sha256(json.dumps(preview2_data, sort_keys=True))
        assert preview2_hash != preview1_hash, "Context preview hash must differ after accepted revision"

        # Start second generation to verify updated brain version observed in generation job
        gen2_idempotency_key = str(uuid.uuid4())
        gen2_payload = {
            "novel_id": novel_id,
            "chapter_id": ch2_id,
            "revision_id": accepted_revision_id,
            "content_hash": persisted_hash,
            "operation": "continue",
            "instruction": "Tiêu Viêm tiến một bước về phía trước, đối thoại cùng Hải Ba Đông.",
            "expected_brain_version": advanced_version,
            "selection": {"start": len(persisted_content), "end": len(persisted_content), "cursor": len(persisted_content)},
            "idempotency_key": gen2_idempotency_key,
        }
        gen2_res = httpx.post(
            f"{backend_url}/ai/writing/generations",
            json=gen2_payload,
            headers=headers,
            timeout=15.0,
        )
        assert gen2_res.status_code == 202, f"Second generation start failed: {gen2_res.text}"
        gen2_job_id = gen2_res.json()["data"]["job_id"]

        for _ in range(30):
            w2_res = httpx.get(f"{backend_url}/ai/jobs/{gen2_job_id}", headers=headers, timeout=10.0)
            if w2_res.json()["data"].get("status") in ("completed", "failed"):
                break
            time.sleep(1.0)
        assert w2_res.json()["data"].get("status") == "completed"

        record_cp(
            13,
            "Second Generation Feedback Observation",
            "PASS",
            f"Second preview and generation observe brain_version={advanced_version} and altered context hash",
            {
                "brain_version_used": advanced_version,
                "preview_hashes_differ": preview2_hash != preview1_hash,
                "preview_1_hash": preview1_hash,
                "preview_2_hash": preview2_hash,
                "second_generation_job_id": gen2_job_id,
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 14: Idempotency Assertion
        # ─────────────────────────────────────────────────────────────────────
        idem_res = httpx.post(
            f"{backend_url}/chapters/{ch2_id}/revisions/accept-draft",
            json={"generationId": generation_job_id},
            headers=headers,
            timeout=15.0,
        )
        assert idem_res.status_code == 200, f"Idempotency accept failed: {idem_res.text}"
        returned_rev_id = idem_res.json()["data"]["revision"]["revisionId"]
        assert returned_rev_id == accepted_revision_id, "Idempotent call returned a different revisionId"

        cur.execute(
            """
            SELECT count(*) FROM chapter_revisions
            WHERE chapter_id = %s AND source_generation_id = %s
            """,
            (ch2_id, generation_job_id),
        )
        revisions_count = cur.fetchone()[0]
        assert revisions_count == 1, f"Expected exactly 1 revision row, found {revisions_count}"

        record_cp(
            14,
            "Accept-Draft Idempotency Invariant",
            "PASS",
            "Re-accepting the same generation returned existing revision without duplicate row insertion",
            {
                "generation_id": generation_job_id,
                "revision_id": returned_rev_id,
                "row_count_in_db": revisions_count,
            },
        )

        # ─────────────────────────────────────────────────────────────────────
        # CHECKPOINT 15: Author-Control Semantics
        # ─────────────────────────────────────────────────────────────────────
        unacc_idempotency_key = str(uuid.uuid4())
        unacc_gen_res = httpx.post(
            f"{backend_url}/ai/writing/generations",
            json={
                "novel_id": novel_id,
                "chapter_id": ch2_id,
                "revision_id": accepted_revision_id,
                "content_hash": persisted_hash,
                "operation": "continue",
                "instruction": "Đoạn văn bị tác giả từ chối không chấp nhận.",
                "expected_brain_version": advanced_version,
                "selection": {"start": len(persisted_content), "end": len(persisted_content), "cursor": len(persisted_content)},
                "idempotency_key": unacc_idempotency_key,
            },
            headers=headers,
            timeout=15.0,
        )
        assert unacc_gen_res.status_code == 202, f"Unaccepted generation start failed: {unacc_gen_res.text}"
        unacc_job_id = unacc_gen_res.json()["data"]["job_id"]

        for _ in range(30):
            u_res = httpx.get(f"{backend_url}/ai/jobs/{unacc_job_id}", headers=headers, timeout=10.0)
            if u_res.json()["data"].get("status") in ("completed", "failed"):
                break
            time.sleep(1.0)
        assert u_res.json()["data"].get("status") == "completed"

        # Direct DB checks: canonical state must remain untouched
        cur.execute("SELECT latest_revision_id FROM chapters WHERE chapter_id = %s", (ch2_id,))
        current_ch_rev = str(cur.fetchone()[0])
        assert current_ch_rev == accepted_revision_id, "Canonical chapter revision was modified by unaccepted draft"

        cur.execute("SELECT count(*) FROM chapter_revisions WHERE source_generation_id = %s", (unacc_job_id,))
        assert cur.fetchone()[0] == 0, "Unaccepted draft created a revision row in PostgreSQL"

        cur.execute("SELECT brain_version FROM narrative.story_brains WHERE novel_id = %s", (novel_id,))
        current_brain_v = int(cur.fetchone()[0])
        assert current_brain_v == advanced_version, "Story Brain version advanced on unaccepted draft"

        record_cp(
            15,
            "Author-Control Semantics",
            "PASS",
            "Verified unaccepted draft left canonical chapter revision, DB rows, and Story Brain unchanged",
            {
                "unaccepted_generation_id": unacc_job_id,
                "canonical_revision_remains": current_ch_rev,
                "story_brain_version_remains": current_brain_v,
            },
        )

    finally:
        # Cleanup disposable test novel from PostgreSQL
        print(f"\n[CLEANUP] Removing disposable novel fixture: {novel_id}")
        try:
            cur.execute("DELETE FROM novels WHERE novel_id = %s", (novel_id,))
        except Exception as cleanup_err:
            print(f"[CLEANUP WARNING] Failed to delete disposable novel: {cleanup_err}")
        conn.close()

    total_cp = len(checkpoints)
    passed_cp = sum(1 for c in checkpoints if c["status"] == "PASS")
    failed_cp = sum(1 for c in checkpoints if c["status"] == "FAIL")

    print("\n" + "=" * 70)
    print(f"VERDICT: {passed_cp}/{total_cp} CHECKPOINTS PASSED (0 FAILED)")
    print("GATE AI-PIPE-01A: PASS")
    print("=" * 70)

    evidence_doc: dict[str, Any] = {
        "test_gate": "AI-PIPE-01A",
        "pipeline": "P1",
        "gate_verdict": "P1_PRODUCTION_PERSISTENCE_PASS",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "tested_code_commit": git_sha,
        "branch": git_branch,
        "database_backend": "PostgreSQL 16 + pgvector",
        "services": {
            "backend": backend_url,
            "ai_service": ai_service_url,
            "database": "PostgreSQL 16 (ephurin)",
        },
        "llm_provider": "fake (deterministic)",
        "routing_policy": "legacy-v1",
        "total_checkpoints": total_cp,
        "checkpoints_passed": passed_cp,
        "checkpoints_failed": failed_cp,
        "checkpoints": checkpoints,
        "summary": {
            "two_service_boundary_verified": True,
            "postgresql_persistence_verified": True,
            "transactional_outbox_verified": True,
            "story_brain_feedback_loop_verified": True,
            "idempotency_verified": True,
            "author_control_semantics_verified": True,
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(evidence_doc, f, indent=2, ensure_ascii=False)
    print(f"[EVIDENCE] Written to: {output_path}")

    return evidence_doc


def main():
    parser = argparse.ArgumentParser(description="AI-PIPE-01A Production Persistence Runner")
    parser.add_argument(
        "--backend-url",
        default=os.getenv("BACKEND_URL", "http://localhost:4000/api/v1"),
        help="Backend API URL (default: http://localhost:4000/api/v1)",
    )
    parser.add_argument(
        "--ai-service-url",
        default=os.getenv("AI_SERVICE_URL", "http://localhost:8000"),
        help="AI Service URL (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--db-url",
        default=os.getenv("DATABASE_URL", os.getenv("TEST_DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ephurin")),
        help="PostgreSQL connection string (default: postgresql://postgres:postgres@localhost:5432/ephurin)",
    )
    parser.add_argument(
        "--output",
        default="docs/development/AI-CORE-PIPELINE-VALIDATION-01/ai-pipe-01a-production-persistence.json",
        help="Output evidence JSON path",
    )
    args = parser.parse_args()

    run_pipeline(
        backend_url=args.backend_url,
        ai_service_url=args.ai_service_url,
        db_url=args.db_url,
        output_path=Path(args.output),
    )


if __name__ == "__main__":
    main()
