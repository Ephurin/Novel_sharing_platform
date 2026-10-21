"""Wave 1E — deterministic S01 Markdown-to-editor title/body provenance regression.

All tests are offline, touch only tmp_path and immutable fixture reads.
Previous Wave 1D full-Markdown-body evidence remains historical, not PASS.
"""
import hashlib
from pathlib import Path
import unicodedata

import pytest

from Pipeline_test.tools.manuscript_fixture import (
    CONVERSION_RULE_VERSION, parse_fixture_chapter,
)
from Pipeline_test.tools.provenance import verify_manuscript_gold_hashes
from Pipeline_test.tests.test_partial_import_idempotency import make_gold_chapters


def test_frozen_five_chapter_source_maps_to_titles_and_body_hashes():
    expected_titles = (
        "Chương 1 — Bến trở về",
        "Chương 2 — Lần đọc thứ nhất",
        "Chương 3 — Hai nơi treo một quả chuông",
        "Chương 4 — Bản đồ không có tiếng nước",
        "Chương 5 — Ba tiếng gõ",
    )
    for index, title in enumerate(expected_titles, 1):
        fixture = parse_fixture_chapter(index)
        source = (Path(__file__).resolve().parents[1] / "input" / "manuscript" / f"ch{index:02d}.md").read_bytes()
        assert fixture["conversion_rule_version"] == CONVERSION_RULE_VERSION
        assert fixture["title"] == title
        assert fixture["source_file_sha256"] == hashlib.sha256(source).hexdigest()
        assert fixture["canonical_body_sha256"] == hashlib.sha256(fixture["body"].encode("utf-8")).hexdigest()
        assert fixture["body"] and not fixture["body"].startswith("# Chương")
        assert fixture["source_file_sha256"] != fixture["canonical_body_sha256"]


def test_s01_canonical_title_body_version_passes():
    chapters = make_gold_chapters()
    ok, reason = verify_manuscript_gold_hashes(
        chapters, expected_novel_id="wave1d-novel", expected_owner_id="wave1d-author")
    assert ok, reason


@pytest.mark.parametrize("mutation", ["h1_leaked_in_body", "synthetic_title", "raw_file_hash",
                                      "missing_revision_body_hash", "lost_unicode"])
def test_old_wave1d_shape_and_corruption_fail_closed(mutation):
    chapters = make_gold_chapters()
    first = chapters[0]
    fixture = parse_fixture_chapter(1)
    if mutation == "h1_leaked_in_body":
        first["canonicalRevision"]["content"] = "# " + first["title"] + "\n\n" + fixture["body"]
    elif mutation == "synthetic_title":
        first["title"] = "Wave1D chapter 1"
    elif mutation == "raw_file_hash":
        first["contentHash"] = fixture["source_file_sha256"]
        first["canonicalRevision"]["contentHash"] = fixture["source_file_sha256"]
    elif mutation == "missing_revision_body_hash":
        del first["canonicalRevision"]["contentHash"]
    else:
        first["canonicalRevision"]["content"] = fixture["body"].replace("Mai Linh", "Mai Lình", 1)
    ok, _ = verify_manuscript_gold_hashes(chapters, expected_novel_id="wave1d-novel",
                                          expected_owner_id="wave1d-author")
    assert not ok


def test_crlf_and_decomposed_unicode_have_versioned_nfc_lf_conversion(tmp_path):
    source = "# Chương 1 — Thử nghiệm\r\n\r\nNo\u0302i dung co\u0301 da\u0302u.\r\n# Đề mục phụ\r\n"
    raw = source.encode("utf-8")
    (tmp_path / "ch01.md").write_bytes(raw)
    got = parse_fixture_chapter(1, tmp_path)
    assert got["title"] == "Chương 1 — Thử nghiệm"
    assert got["body"] == unicodedata.normalize("NFC", "No\u0302i dung co\u0301 da\u0302u.\n# Đề mục phụ\n")
    assert got["source_file_sha256"] == hashlib.sha256(raw).hexdigest()
    assert got["canonical_body_sha256"] == hashlib.sha256(got["body"].encode()).hexdigest()


@pytest.mark.parametrize("source", [
    "",
    "# Chương 1 — Trống\n\n",
    "# Chương 2 — Sai thứ tự\n\nVăn bản",
    "# Chương 1 — Thiếu dòng trống\nVăn bản",
    "Chương 1 — Thiếu dấu H1\n\nVăn bản",
    "# Chương 1 — Thiếu\n\n \n",
    "\ufeff# Chương 1 — BOM\n\nVăn bản",
    "# Chương 1 — Dấu CR\rVăn bản",
])
def test_reject_malformed_or_empty_fixture(tmp_path, source):
    (tmp_path / "ch01.md").write_bytes(source.encode("utf-8"))
    with pytest.raises(ValueError):
        parse_fixture_chapter(1, tmp_path)


def test_fixture_parser_does_not_modify_original_source_file(tmp_path):
    path = tmp_path / "ch01.md"
    raw = "# Chương 1 — Bản gốc\n\nMột đoạn văn có dấu.\n".encode("utf-8")
    path.write_bytes(raw)
    parse_fixture_chapter(1, tmp_path)
    assert path.read_bytes() == raw
