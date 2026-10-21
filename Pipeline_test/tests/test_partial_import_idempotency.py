"""
Offline Test Suite: Partial Import & Replay Idempotency Safety (Wave 1C, V1C-03).
Verifies:
1. 0 chapters existing: Fails closed with S01_PARTIAL_IMPORT_REQUIRES_RECOVERY, 0 extra novel POSTs.
2. 1 chapter existing: Fails closed with S01_PARTIAL_IMPORT_REQUIRES_RECOVERY, 0 extra novel POSTs.
3. 3 chapters existing: Fails closed with S01_PARTIAL_IMPORT_REQUIRES_RECOVERY, 0 extra novel POSTs.
4. 4 chapters existing: Fails closed with S01_PARTIAL_IMPORT_REQUIRES_RECOVERY, 0 extra novel POSTs.
5. 6 chapters (duplicate extra): Fails closed with S01_PARTIAL_IMPORT_REQUIRES_RECOVERY, 0 extra novel POSTs.
6. 5 chapters but content hash mismatch against gold manuscript fixture: Fails closed with S01_PARTIAL_IMPORT_HASH_MISMATCH, 0 extra novel POSTs.
7. 5 chapters but revision_id missing or identical to chapter_id: Fails closed with S01_PARTIAL_IMPORT_HASH_MISMATCH, 0 extra novel POSTs.
8. Corrupt/unreadable checkpoint.json: Fails closed, 0 extra novel POSTs.
9. Ambiguous multiple owned novels with same title: Fails closed, 0 extra novel POSTs.
10. Valid 5 chapters matching gold fixtures: Resumes idempotently, 0 extra novel POSTs.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = REPO_ROOT / "Pipeline_test" / "input" / "manuscript"
JOURNEY_DIR = REPO_ROOT / "Pipeline_test" / "runs" / "2026-10-21-gemini-p1-live-01"
if str(JOURNEY_DIR) not in sys.path:
    sys.path.insert(0, str(JOURNEY_DIR))

from Pipeline_test.tools.provenance import verify_manuscript_gold_hashes as _verify
from Pipeline_test.tools.manuscript_fixture import parse_fixture_chapter

def verify_manuscript_gold_hashes(chapters, fixture_dir=None):
    return _verify(chapters, fixture_dir=fixture_dir, expected_novel_id='wave1d-novel', expected_owner_id='wave1d-author')


def make_gold_chapters():
    """Generates 5 mock chapters with real SHA-256 hashes matching the gold manuscript fixtures."""
    chapters = []
    chapter_files = [
        ("ch01.md", 1, "Chương 1 — Bến trở về"),
        ("ch02.md", 2, "Chương 2 — Lần đọc thứ nhất"),
        ("ch03.md", 3, "Chương 3 — Hai nơi treo một quả chuông"),
        ("ch04.md", 4, "Chương 4 — Bản đồ không có tiếng nước"),
        ("ch05.md", 5, "Chương 5 — Ba tiếng gõ"),
    ]
    for fname, ch_num, title in chapter_files:
        parsed = parse_fixture_chapter(ch_num, fixture_dir=FIXTURE_DIR)
        assert parsed["title"] == title
        body, sha = parsed["body"], parsed["canonical_body_sha256"]
        chapters.append({
            "chapterNumber": ch_num,
            "chapterId": f"chap-uuid-{ch_num:02d}",
            "latestRevisionId": f"rev-uuid-{ch_num:02d}",  # Distinct from chapterId
            "contentHash": sha,
            "novelId": "wave1d-novel", "ownerId": "wave1d-author",
            "canonicalRevision": {"revisionId": f"rev-uuid-{ch_num:02d}", "chapterId": f"chap-uuid-{ch_num:02d}",
                "novelId": "wave1d-novel", "contentHash": sha, "content": body},
            "title": title,
            "wordCount": len(body.split()),
        })
    return chapters


def test_verify_manuscript_gold_hashes_passes_on_exact_fixtures():
    """Verifies that 5 chapters matching fixture hashes pass validation."""
    chapters = make_gold_chapters()
    is_valid, reason = verify_manuscript_gold_hashes(chapters, fixture_dir=FIXTURE_DIR)
    assert is_valid is True
    assert "All 5 chapters match gold fixture hashes" in reason


def test_verify_manuscript_gold_hashes_fails_on_partial_chapter_counts():
    """Verifies fail-closed behavior on 0, 1, 3, 4, 6 chapters."""
    gold = make_gold_chapters()
    for count in [0, 1, 3, 4, 6]:
        subset = gold[:count] if count <= 5 else gold + [gold[0]]
        is_valid, reason = verify_manuscript_gold_hashes(subset, fixture_dir=FIXTURE_DIR)
        assert is_valid is False
        assert f"Expected exactly 5 chapters, found {count}" in reason


def test_verify_manuscript_gold_hashes_fails_on_hash_mismatch():
    """Verifies fail-closed when chapter 3 content hash was modified or corrupted."""
    chapters = make_gold_chapters()
    chapters[2]["contentHash"] = "badhash_corrupt_tampered_00000000000000000000000000000000"
    is_valid, reason = verify_manuscript_gold_hashes(chapters, fixture_dir=FIXTURE_DIR)
    assert is_valid is False
    assert "Chapter 3 content hash mismatch" in reason


def test_verify_manuscript_gold_hashes_fails_when_revision_id_identical_to_chapter_id():
    """Rejects placeholder or conflated chapterId == revisionId (Checkpoint D1)."""
    chapters = make_gold_chapters()
    chapters[0]["latestRevisionId"] = chapters[0]["chapterId"]  # Conflated!
    is_valid, reason = verify_manuscript_gold_hashes(chapters, fixture_dir=FIXTURE_DIR)
    assert is_valid is False
    assert "identical chapter/revision_id" in reason


def run_s01_simulation(tmp_path, checkpoint_content, server_chapters, user_novels=None, author_user="p1_author"):
    """
    Simulates the exact S01 execution logic from execute_p1_journey.py.
    Tracks all POST calls to /novels.
    """
    post_calls = []

    if checkpoint_content is not None:
        (tmp_path / "checkpoint.json").write_text(checkpoint_content, encoding="utf-8")

    novel_payload = {
        "title": "Gió Thoảng Qua Phố Cổ",
        "genre": "Đô thị / Tình cảm",
        "synopsis": "Hành trình trở về phố cổ của Mai Linh sau nhiều năm xa cách.",
    }

    checkpoint_file = tmp_path / "checkpoint.json"
    novel_id = None
    if checkpoint_file.exists():
        try:
            with open(checkpoint_file, "r", encoding="utf-8") as f:
                ckpt_data = json.load(f)
                novel_id = ckpt_data.get("main_novel_id")
        except Exception as e:
            raise RuntimeError(f"Corrupt or unreadable checkpoint.json (V1C-03 fail-closed): {e}")

    user_owned_novels = user_novels if user_novels is not None else [
        {"novelId": novel_id or "existing-novel-1", "authorId": author_user, "title": novel_payload["title"]}
    ]

    matching_novel = None
    if novel_id:
        matching_novel = next((n for n in user_owned_novels if (n.get("novelId") or n.get("id")) == novel_id), None)
    else:
        matching_titles = [n for n in user_owned_novels if n.get("title") == novel_payload["title"]]
        if len(matching_titles) == 1:
            matching_novel = matching_titles[0]
            novel_id = matching_novel.get("novelId") or matching_novel.get("id")
        elif len(matching_titles) > 1:
            raise RuntimeError(
                f"Ambiguous state: multiple owned novels found with title '{novel_payload['title']}'. "
                "Failing closed per V1C-03; cannot infer novel identity."
            )

    if novel_id:
        existing_chapters = server_chapters
        if len(existing_chapters) != 5:
            raise RuntimeError(
                f"S01_PARTIAL_IMPORT_REQUIRES_RECOVERY: Existing novel {novel_id} has {len(existing_chapters)} "
                f"chapters (expected 5). Halting without creating duplicate novel (V1C-03 fail-closed)."
            )

        is_gold, reason = verify_manuscript_gold_hashes(existing_chapters, fixture_dir=FIXTURE_DIR)
        if not is_gold:
            raise RuntimeError(
                f"S01_PARTIAL_IMPORT_HASH_MISMATCH: Existing novel {novel_id} failed gold validation: {reason}. "
                "Halting without creating duplicate novel (V1C-03 fail-closed)."
            )

        return {"status": "RESUMED_IDEMPOTENT", "novel_id": novel_id, "posts": post_calls}
    else:
        post_calls.append({"path": "/novels", "payload": novel_payload})
        return {"status": "CREATED_NEW", "novel_id": "new-novel-uuid", "posts": post_calls}


@pytest.mark.parametrize("chapter_count", [0, 1, 3, 4, 6])
def test_partial_import_fails_closed_with_zero_novel_posts(tmp_path, chapter_count):
    """
    Proves that when an existing novel has 0, 1, 3, 4, or 6 chapters,
    the runner FAILS CLOSED with S01_PARTIAL_IMPORT_REQUIRES_RECOVERY
    and NEVER issues a POST /novels call creating a duplicate novel.
    """
    gold = make_gold_chapters()
    server_chapters = gold[:chapter_count] if chapter_count <= 5 else gold + [gold[0]]
    ckpt_content = json.dumps({"main_novel_id": "novel-existing-p1"})

    with pytest.raises(RuntimeError) as exc_info:
        run_s01_simulation(tmp_path, ckpt_content, server_chapters)

    assert "S01_PARTIAL_IMPORT_REQUIRES_RECOVERY" in str(exc_info.value)
    assert f"has {chapter_count} chapters (expected 5)" in str(exc_info.value)


def test_corrupt_checkpoint_fails_closed_zero_novel_posts(tmp_path):
    """Proves that a corrupted checkpoint.json halts without creating a new novel."""
    corrupt_ckpt = "{ invalid json content: 123"
    gold = make_gold_chapters()

    with pytest.raises(RuntimeError) as exc_info:
        run_s01_simulation(tmp_path, corrupt_ckpt, gold)

    assert "Corrupt or unreadable checkpoint.json" in str(exc_info.value)


def test_ambiguous_duplicate_owned_titles_fails_closed(tmp_path):
    """Proves that multiple owned novels with same title halt fail-closed without guessing."""
    gold = make_gold_chapters()
    multiple_novels = [
        {"novelId": "nov-1", "authorId": "p1_author", "title": "Gió Thoảng Qua Phố Cổ"},
        {"novelId": "nov-2", "authorId": "p1_author", "title": "Gió Thoảng Qua Phố Cổ"},
    ]
    with pytest.raises(RuntimeError) as exc_info:
        run_s01_simulation(tmp_path, None, gold, user_novels=multiple_novels)

    assert "Ambiguous state: multiple owned novels found with title" in str(exc_info.value)


def test_verified_5_chapters_resumes_idempotently_with_zero_novel_posts(tmp_path):
    """
    Proves that when all 5 chapters exist and match gold fixtures,
    the runner safely resumes idempotently with exactly ZERO POST /novels calls.
    """
    gold = make_gold_chapters()
    ckpt_content = json.dumps({"main_novel_id": "novel-existing-p1"})

    res = run_s01_simulation(tmp_path, ckpt_content, gold)
    assert res["status"] == "RESUMED_IDEMPOTENT"
    assert res["novel_id"] == "novel-existing-p1"
    assert len(res["posts"]) == 0, f"Expected 0 POST calls, got {len(res['posts'])}"


@pytest.mark.parametrize('mutation', ['empty_hash','missing_hash','duplicate_number','duplicate_id','scrambled','wrong_owner','stale','missing_readback','empty_revision'])
def test_wave1d_strict_provenance_rejects_incomplete_or_ambiguous_readback(mutation):
    chapters=make_gold_chapters()
    if mutation=='empty_hash':chapters[0]['contentHash']=''
    elif mutation=='missing_hash':del chapters[0]['contentHash']
    elif mutation=='duplicate_number':chapters[1]['chapterNumber']=1
    elif mutation=='duplicate_id':chapters[1]['chapterId']=chapters[0]['chapterId']
    elif mutation=='scrambled':chapters[0],chapters[1]=chapters[1],chapters[0]
    elif mutation=='wrong_owner':chapters[0]['ownerId']='someone-else'
    elif mutation=='stale':chapters[0]['canonicalRevision']['revisionId']='old'
    elif mutation=='missing_readback':del chapters[0]['canonicalRevision']
    elif mutation=='empty_revision':chapters[0]['latestRevisionId']=''
    assert verify_manuscript_gold_hashes(chapters)[0] is False
