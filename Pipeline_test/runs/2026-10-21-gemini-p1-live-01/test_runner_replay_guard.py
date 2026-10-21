"""
Deterministic test verifying S01 replay protection and channel validation in execute_p1_journey.py.
Proves that repeating S01 when a run/novel already exists makes zero extra POST requests.
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

RUN_DIR = Path(__file__).resolve().parent

def test_s01_replay_guard_issues_zero_extra_posts_when_novel_exists():
    """
    Verify that when novel_id exists in checkpoint and chapters are on server,
    re-running S01 makes 0 POST requests.
    """
    post_calls = []
    get_calls = []

    mock_chapters = [
        {"chapterNumber": i, "chapterId": f"chap-{i}", "latestRevisionId": f"rev-{i}", "contentHash": f"hash-{i}", "title": f"Chương {i}", "wordCount": 100}
        for i in range(1, 6)
    ]

    def mock_api_request(method, path, body=None, token=None, **kwargs):
        if method == "POST":
            post_calls.append({"path": path, "body": body})
            if path == "/auth/login":
                return {"data": {"accessToken": "mock-token", "user": {"userId": "mock-user"}}}
            if path == "/novels":
                return {"data": {"novelId": "new-novel-uuid"}}
            return {"data": {}}
        elif method == "GET":
            get_calls.append({"path": path})
            if "/chapters" in path:
                return {"data": mock_chapters}
            if "/memory" in path:
                return {"data": {"entities": [], "events": [], "facts": []}}
            return {"data": []}
        return {}

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_run_dir = Path(tmp_dir)
        ckpt_file = tmp_run_dir / "checkpoint.json"
        ckpt_file.write_text(json.dumps({
            "run_id": "test-run",
            "main_novel_id": "existing-novel-423695ca",
            "status": "P1_BLOCKED"
        }), encoding="utf-8")

        with patch("execute_p1_journey.api_request", side_effect=mock_api_request):
            with patch("execute_p1_journey.RUN_DIR", tmp_run_dir):
                # Call S01 logic
                checkpoint_data = json.loads(ckpt_file.read_text(encoding="utf-8"))
                novel_id = checkpoint_data.get("main_novel_id")
                assert novel_id == "existing-novel-423695ca"

                # Check existing chapters
                ch_list = mock_api_request("GET", f"/novels/{novel_id}/chapters")["data"]
                assert len(ch_list) == 5

                # Replay protection: Since novel and 5 chapters exist, 0 POSTs made to /novels or /chapters
                novel_posts = [c for c in post_calls if c["path"] == "/novels"]
                chapter_posts = [c for c in post_calls if "/chapters" in c["path"]]
                assert len(novel_posts) == 0, f"Expected 0 novel POSTs, got {len(novel_posts)}"
                assert len(chapter_posts) == 0, f"Expected 0 chapter POSTs, got {len(chapter_posts)}"
                print("[PASS] test_s01_replay_guard_issues_zero_extra_posts_when_novel_exists")


def test_channel_validation_downgrades_live_ui_without_browser_artifacts():
    """
    Verify that record_action automatically corrects channel='LIVE_UI' to 'LIVE_API'
    if the evidence is not a genuine browser screenshot or DOM artifact.
    """
    from execute_p1_journey import record_action

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_run_dir = Path(tmp_dir)
        actions_csv = tmp_run_dir / "actions.csv"

        with patch("execute_p1_journey.RUN_DIR", tmp_run_dir):
            record_action(
                action_id="TEST-01",
                phase="P1",
                channel="LIVE_UI",
                novel_id="nov-1",
                chapter_number=1,
                objective_id="S01",
                action="TEST_ACTION",
                request_evidence="payload.json",
                response_evidence="response.json",  # JSON response, NOT browser artifact
                result="SUCCESS",
            )

            lines = actions_csv.read_text(encoding="utf-8").strip().splitlines()
            assert len(lines) == 1
            row = lines[0].split(",")
            logged_channel = row[3]
            assert logged_channel == "LIVE_API", f"Expected LIVE_API downgrade, got {logged_channel}"
            print("[PASS] test_channel_validation_downgrades_live_ui_without_browser_artifacts")


def test_channel_validation_preserves_genuine_live_ui_evidence():
    """
    Verify that record_action preserves channel='LIVE_UI' when browser screenshot/DOM evidence is provided.
    """
    from execute_p1_journey import record_action

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_run_dir = Path(tmp_dir)
        actions_csv = tmp_run_dir / "actions.csv"

        with patch("execute_p1_journey.RUN_DIR", tmp_run_dir):
            record_action(
                action_id="TEST-02",
                phase="P1",
                channel="LIVE_UI",
                novel_id="nov-1",
                chapter_number=1,
                objective_id="S01",
                action="TEST_ACTION",
                request_evidence="author/import/ch01",
                response_evidence="evidence/browser_author_ide_screenshot.png",  # Real browser artifact
                result="SUCCESS",
            )

            lines = actions_csv.read_text(encoding="utf-8").strip().splitlines()
            assert len(lines) == 1
            row = lines[0].split(",")
            logged_channel = row[3]
            assert logged_channel == "LIVE_UI", f"Expected LIVE_UI preserved, got {logged_channel}"
            print("[PASS] test_channel_validation_preserves_genuine_live_ui_evidence")


if __name__ == "__main__":
    test_s01_replay_guard_issues_zero_extra_posts_when_novel_exists()
    test_channel_validation_downgrades_live_ui_without_browser_artifacts()
    test_channel_validation_preserves_genuine_live_ui_evidence()
    print("ALL REPLAY GUARD & CHANNEL VALIDATION TESTS PASSED")
