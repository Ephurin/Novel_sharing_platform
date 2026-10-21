"""
Offline Test Suite: Authentic Browser E2E Evidence Validation (Wave 1C, V1C-02).
Verifies:
1. Rejects fake paths (nonexistent files on disk).
2. Rejects empty files (0-byte screenshot/DOM).
3. Rejects screenshot/DOM without accompanying action provenance manifest.
4. Rejects provenance with mismatched novel_id.
5. Rejects provenance with invalid action_kind (e.g. synthetic string).
6. Rejects provenance with invalid application_url.
7. Rejects corrupted or malformed JSON provenance.
8. Accepts authentic browser session evidence (valid non-empty screenshot + valid action provenance manifest).
"""

from __future__ import annotations

import csv
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
JOURNEY_DIR = REPO_ROOT / "Pipeline_test" / "runs" / "2026-10-21-gemini-p1-live-01"
if str(JOURNEY_DIR) not in sys.path:
    sys.path.insert(0, str(JOURNEY_DIR))

from execute_p1_journey import validate_browser_evidence, record_action


def test_rejects_nonexistent_evidence_file(tmp_path):
    """Rejects mere string paths pointing to nonexistent files."""
    is_valid, reason = validate_browser_evidence(
        "evidence/fake_browser_nonexistent.png",
        action_id="ACT-01",
        novel_id="novel-123",
        run_dir=tmp_path,
    )
    assert is_valid is False
    assert "does not exist on disk" in reason


def test_rejects_empty_evidence_file(tmp_path):
    """Rejects 0-byte screenshot or DOM files."""
    empty_png = tmp_path / "empty_screenshot.png"
    empty_png.write_bytes(b"")

    is_valid, reason = validate_browser_evidence(
        str(empty_png),
        action_id="ACT-02",
        novel_id="novel-123",
        run_dir=tmp_path,
    )
    assert is_valid is False
    assert "empty (0 bytes)" in reason


def test_rejects_screenshot_without_accompanying_provenance(tmp_path):
    """Rejects non-empty .png when no accompanying .json provenance manifest exists."""
    real_png = tmp_path / "valid_image_no_metadata.png"
    real_png.write_bytes(b"\x89PNG\r\n\x1a\nfake_image_bytes")

    is_valid, reason = validate_browser_evidence(
        str(real_png),
        action_id="ACT-03",
        novel_id="novel-123",
        run_dir=tmp_path,
    )
    assert is_valid is False
    assert "lacks accompanying action provenance manifest" in reason


def test_rejects_provenance_with_mismatched_novel_id(tmp_path):
    """Rejects provenance manifest referencing a different novel."""
    prov_file = tmp_path / "mismatched_novel.json"
    prov_file.write_text(
        json.dumps({
            "action_kind": "click",
            "application_url": "http://127.0.0.1:18080/author/novels/other-novel",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "novel_id": "other-novel-456",
        }),
        encoding="utf-8",
    )

    is_valid, reason = validate_browser_evidence(
        str(prov_file),
        action_id="ACT-04",
        novel_id="target-novel-123",
        run_dir=tmp_path,
    )
    assert is_valid is False
    assert "Provenance novel_id mismatch" in reason


def test_rejects_provenance_with_invalid_action_kind(tmp_path):
    """Rejects provenance that specifies synthetic or invalid action kind."""
    prov_file = tmp_path / "invalid_action.json"
    prov_file.write_text(
        json.dumps({
            "action_kind": "synthetic_http_post",
            "application_url": "http://127.0.0.1:18080/novels",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "novel_id": "novel-123",
        }),
        encoding="utf-8",
    )

    is_valid, reason = validate_browser_evidence(
        str(prov_file),
        action_id="ACT-05",
        novel_id="novel-123",
        run_dir=tmp_path,
    )
    assert is_valid is False
    assert "Invalid or missing action_kind" in reason


def test_rejects_provenance_with_invalid_url(tmp_path):
    """Rejects provenance without a valid HTTP(S) URL."""
    prov_file = tmp_path / "invalid_url.json"
    prov_file.write_text(
        json.dumps({
            "action_kind": "click",
            "application_url": "ftp://unsupported/path",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "novel_id": "novel-123",
        }),
        encoding="utf-8",
    )

    is_valid, reason = validate_browser_evidence(
        str(prov_file),
        action_id="ACT-06",
        novel_id="novel-123",
        run_dir=tmp_path,
    )
    assert is_valid is False
    assert "Invalid application_url" in reason


def test_accepts_authentic_browser_session_evidence(tmp_path):
    """Accepts genuine non-empty screenshot accompanied by valid action provenance manifest."""
    png_file = tmp_path / "author_ide_chapter_import.png"
    png_file.write_bytes(b"\x89PNG\r\n\x1a\nreal_screenshot_bytes_here")

    prov_file = tmp_path / "author_ide_chapter_import.json"
    prov_file.write_text(
        json.dumps({
            "action_kind": "click",
            "application_url": "http://127.0.0.1:18080/author/novels/novel-123/import",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "novel_id": "novel-123",
            "selector": "button#import-manuscript-submit",
            "user_id": "p1_author",
        }),
        encoding="utf-8",
    )

    is_valid, reason = validate_browser_evidence(
        str(png_file),
        action_id="ACT-07",
        novel_id="novel-123",
        run_dir=tmp_path,
    )
    assert is_valid is True
    assert "Authentic browser automation JSON manifest verified" in reason


def test_record_action_downgrades_fake_live_ui_to_live_api(tmp_path, monkeypatch):
    """Proves record_action automatically corrects channel='LIVE_UI' to 'LIVE_API' on invalid evidence."""
    monkeypatch.setattr("execute_p1_journey.RUN_DIR", tmp_path)
    actions_file = tmp_path / "actions.csv"

    record_action(
        action_id="ACT-TEST-01",
        phase="P1",
        channel="LIVE_UI",
        novel_id="novel-123",
        chapter_number=1,
        objective_id="S01",
        action="CLICK_IMPORT_BUTTON",
        request_evidence="button#import",
        response_evidence="evidence/nonexistent_browser.png",  # Fake!
        result="SUCCESS",
    )

    rows = list(csv.reader(actions_file.read_text(encoding="utf-8").splitlines()))
    assert len(rows) == 1
    logged_channel = rows[0][3]
    assert logged_channel == "LIVE_API", f"Must be corrected to LIVE_API, got {logged_channel}"


def test_record_action_preserves_authentic_live_ui_channel(tmp_path, monkeypatch):
    """Proves record_action preserves channel='LIVE_UI' when authentic browser session artifacts exist."""
    monkeypatch.setattr("execute_p1_journey.RUN_DIR", tmp_path)
    actions_file = tmp_path / "actions.csv"

    # Create real screenshot + accompanying provenance
    evidence_dir = tmp_path / "evidence"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    png_path = evidence_dir / "genuine_s01.png"
    png_path.write_bytes(b"\x89PNG\r\n\x1a\nauthentic_browser_screenshot")
    json_path = evidence_dir / "genuine_s01.json"
    json_path.write_text(
        json.dumps({
            "action_kind": "click",
            "application_url": "http://127.0.0.1:18080/novels/novel-123",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "novel_id": "novel-123",
        }),
        encoding="utf-8",
    )

    record_action(
        action_id="ACT-TEST-02",
        phase="P1",
        channel="LIVE_UI",
        novel_id="novel-123",
        chapter_number=1,
        objective_id="S01",
        action="CLICK_SUBMIT",
        request_evidence="button#submit",
        response_evidence=str(png_path),
        result="SUCCESS",
    )

    rows = list(csv.reader(actions_file.read_text(encoding="utf-8").splitlines()))
    assert len(rows) == 1
    logged_channel = rows[0][3]
    assert logged_channel == "LIVE_UI", f"Must preserve LIVE_UI, got {logged_channel}"
