"""
P1 Demo QA — Secret Hygiene & Public Artifact Validator
Scans public artifacts and manifests to guarantee zero leakage of:
- JWT / access tokens
- Passwords
- API keys / Service tokens
- Raw confidential author notes

Usage:
  python scripts/verify_secret_hygiene.py
  python scripts/verify_secret_hygiene.py --target <dir_or_file>
  python scripts/verify_secret_hygiene.py --test-negative
"""
import argparse
import json
import os
import pathlib
import re
import sys

# Configure UTF-8 stdout for Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Regex rules for sensitive data leakage
RULES = [
    (
        "JWT_ACCESS_TOKEN",
        re.compile(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+'),
        "Unredacted JWT detected"
    ),
    (
        "BEARER_TOKEN_VALUE",
        re.compile(r'Bearer\s+(?!\[REDACTED\]|\[REDACTED_TOKEN\]|token|\{token\}|<token>|\{authorToken\})[A-Za-z0-9_\-\.]{15,}'),
        "Live Bearer token detected"
    ),
    (
        "AUTHORIZATION_HEADER_LEAK",
        re.compile(r'"(?:authorization|Authorization)"\s*:\s*"(?!(?:\[REDACTED\]|Bearer \[REDACTED\]|Bearer \[REDACTED_TOKEN\]|Bearer \[REDACTED_JWT\]|""))[^"]{8,}"', re.I),
        "Unredacted authorization header in evidence"
    ),
    (
        "PLAINTEXT_PASSWORD_FIELD",
        re.compile(r'"(?:password|author_pass|admin_pass)"\s*:\s*"(?!(?:\[REDACTED\]|""))[^"]{3,}"', re.I),
        "Plaintext password field found in JSON"
    ),
    (
        "ACTIVE_TOKEN_FIELD",
        re.compile(r'"(?:accessToken|access_token|author_token)"\s*:\s*"(?!(?:\[REDACTED\]|""))[^"]{8,}"', re.I),
        "Active access token field found in JSON"
    ),
    (
        "PRIVATE_SENTINEL_NOTE",
        re.compile(r'SENTINEL_NOTE_[A-Za-z0-9_]+'),
        "Private author note sentinel leaked in evidence"
    ),
    (
        "RAW_SECRET_NOTE_LEAK_IN_MANIFEST",
        re.compile(r'"(?:author_secret_note|private_author_notes|private_note_raw)"\s*:\s*"(?!(?:\[REDACTED\]|\[REDACTED_PRIVATE_NOTE\]|""))[^"]{8,}"', re.I),
        "Raw author private secret note leaked in manifest/evidence"
    ),
    (
        "RAW_PROFILE_NOTE_HTTP",
        re.compile(r'"author_notes"\s*:\s*"(?!(?:\[REDACTED\]|\[REDACTED_PRIVATE_NOTE\]|\[REDACTED_AUTHOR_NOTE_MASKED\]|""))[^"]{3,}"', re.I),
        "Raw author_notes leaked in HTTP request/response evidence"
    ),
    (
        "AUDIT_SNAPSHOT_LEAK",
        re.compile(r'"(?:audit_snapshot|before|after)"\s*:\s*\{[^}]*"(?:private_author_notes|author_notes)"\s*:\s*"(?!(?:\[REDACTED\]|\[REDACTED_PRIVATE_NOTE\]|""))[^"]{3,}"', re.I),
        "Private notes leaked in audit snapshot"
    ),
]

SAFE_EXTENSIONS = {".json", ".md", ".txt", ".mjs", ".ts", ".py", ".log"}


def scan_file(file_path):
    """Scan a single file for credential hygiene violations."""
    violations = []
    try:
        content = pathlib.Path(file_path).read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        return [{"file": str(file_path), "line": 0, "rule": "READ_ERROR", "desc": str(exc), "snippet": ""}]

    lines = content.splitlines()
    for idx, line in enumerate(lines, start=1):
        for rule_id, regex, desc in RULES:
            match = regex.search(line)
            if match:
                matched_snippet = match.group(0)[:16] + "..."
                violations.append({
                    "file": str(file_path),
                    "line": idx,
                    "rule": rule_id,
                    "desc": desc,
                    "snippet": matched_snippet
                })
    return violations


def scan_zip(zip_path):
    """Scan uncompressed text entries of a ZIP file (e.g. playwright-trace.zip)."""
    import zipfile
    violations = []
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                ext = pathlib.Path(info.filename).suffix.lower()
                if ext in {".json", ".txt", ".md", ".log", ".html", ""}:
                    try:
                        raw = zf.read(info.filename)
                        content = raw.decode("utf-8", errors="replace")
                    except Exception:
                        continue
                    for idx, line in enumerate(content.splitlines(), start=1):
                        for rule_id, regex, desc in RULES:
                            match = regex.search(line)
                            if match:
                                violations.append({
                                    "file": f"{zip_path}!{info.filename}",
                                    "line": idx,
                                    "rule": rule_id,
                                    "desc": desc,
                                    "snippet": match.group(0)[:16] + "..."
                                })
    except Exception as exc:
        violations.append({
            "file": str(zip_path),
            "line": 0,
            "rule": "ZIP_READ_ERROR",
            "desc": str(exc),
            "snippet": ""
        })
    return violations


def scan_directory(target_dir):
    """Recursively scan a directory including zip archives for public artifact violations."""
    all_violations = []
    target_path = pathlib.Path(target_dir).resolve()

    if target_path.is_file():
        if target_path.suffix.lower() == ".zip":
            return scan_zip(target_path)
        return scan_file(target_path)

    for root, _, files in os.walk(target_path):
        if any(ignored in root for ignored in [".git", "node_modules", "__pycache__", ".pytest_tmp"]):
            continue
        for f in files:
            p = pathlib.Path(root) / f
            ext = p.suffix.lower()
            if ext == ".zip":
                all_violations.extend(scan_zip(p))
            elif ext in SAFE_EXTENSIONS:
                all_violations.extend(scan_file(p))
    return all_violations


def run_negative_tests():
    """Negative self-tests to prove validator catches all 7 required leakage classes."""
    import io
    import zipfile

    print("[*] Running Secret Hygiene Negative Self-Tests (7 required classes)...")

    def match_rules(text):
        matched = []
        for rule_id, regex, _ in RULES:
            if regex.search(text):
                matched.append(rule_id)
        return matched

    # 1. JWT
    synthetic_jwt = '{"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.abcdEFGH1234567890_-xyz"}'
    assert "JWT_ACCESS_TOKEN" in match_rules(synthetic_jwt), "Failed to catch synthetic JWT"
    print("    [OK] Negative Test 1: JWT detected successfully")

    # 2. Plaintext Password
    synthetic_pass = '{\n  "username": "author_user",\n  "password": "RealSecretPassword123!"\n}'
    assert "PLAINTEXT_PASSWORD_FIELD" in match_rules(synthetic_pass), "Failed to catch plaintext password"
    print("    [OK] Negative Test 2: Plaintext password detected successfully")

    # 3. Authorization Header / Bearer token
    synthetic_auth = '{\n  "authorization": "Bearer 1234567890abcdef1234567890"\n}'
    rules3 = match_rules(synthetic_auth)
    assert "BEARER_TOKEN_VALUE" in rules3 or "AUTHORIZATION_HEADER_LEAK" in rules3, "Failed to catch Bearer/auth header"
    print("    [OK] Negative Test 3: Authorization header / Bearer token detected successfully")

    # 4. Private author note sentinel
    synthetic_sentinel = '{"note": "SENTINEL_NOTE_CONFIDENTIAL_LORE_7749_SECRET"}'
    assert "PRIVATE_SENTINEL_NOTE" in match_rules(synthetic_sentinel), "Failed to catch private note sentinel"
    print("    [OK] Negative Test 4: Private note sentinel detected successfully")

    # 5. Private audit snapshots
    synthetic_audit = '{"after": {"id": "1", "author_notes": "Bí mật Ma Thần không được công khai"}}'
    assert "AUDIT_SNAPSHOT_LEAK" in match_rules(synthetic_audit) or "RAW_PROFILE_NOTE_HTTP" in match_rules(synthetic_audit), "Failed to catch audit snapshot leak"
    print("    [OK] Negative Test 5: Audit snapshot leak detected successfully")

    # 6. Raw profile note in HTTP request/response
    synthetic_http_body = '{"method": "PATCH", "body": {"appearance": "Tall", "author_notes": "Tình tiết tuyệt mật chưa ra mắt"}}'
    assert "RAW_PROFILE_NOTE_HTTP" in match_rules(synthetic_http_body), "Failed to catch raw profile note in HTTP payload"
    print("    [OK] Negative Test 6: Raw profile note in HTTP payload detected successfully")

    # 7. Private input in browser trace/DOM (scanned inside zip archive)
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("snapshot-dom.json", json.dumps({"tag": "textarea", "value": "SENTINEL_NOTE_CONFIDENTIAL_LORE_7749_SECRET"}))
    zip_buffer.seek(0)
    zip_violations = []
    with zipfile.ZipFile(zip_buffer, 'r') as zf:
        for info in zf.infolist():
            content = zf.read(info.filename).decode('utf-8')
            for rule_id, regex, desc in RULES:
                if regex.search(content):
                    zip_violations.append(rule_id)
    assert "PRIVATE_SENTINEL_NOTE" in zip_violations, "Failed to catch private note inside zip entry"
    print("    [OK] Negative Test 7: Private input inside trace ZIP detected successfully")

    # 8. Clean sanitized manifest must pass with 0 violations
    sanitized_manifest = json.dumps({
        "manifest_type": "P1_DEMO_FIXTURE_PUBLIC_MANIFEST",
        "novel": {"novel_id": "11111111-1111-1111-1111-111111111111", "title": "Đại Lục Tinh Thần"},
        "author": {"username": "author_demo", "password": "[REDACTED]", "token": "[REDACTED]"},
        "authorization": "[REDACTED]",
        "author_notes": "[REDACTED_PRIVATE_NOTE]",
        "chapters": [{"chapter_id": "22222222-2222-2222-2222-222222222222", "title": "Chương 1"}],
        "stages": {"basic_fixture": "BASIC_FIXTURE_READY", "canon_fixture": "CANON_FIXTURE_PENDING_HITL"}
    })
    clean_rules = match_rules(sanitized_manifest)
    assert len(clean_rules) == 0, f"Validator falsely flagged clean sanitized manifest: {clean_rules}"
    print("    [OK] Positive Test 8: Sanitized manifest passed with zero violations")

    print("\n[OK] All 7 Negative Tests + Positive Clean Test PASSED!\n")
    return True


def main():
    parser = argparse.ArgumentParser(description="Secret Hygiene Validator")
    parser.add_argument(
        "--target",
        default="docs/development/integration/p1-author/p1-demo-qa-prep",
        help="Target file or directory to scan"
    )
    parser.add_argument(
        "--test-negative",
        action="store_true",
        default=False,
        help="Run negative verification tests"
    )
    args = parser.parse_args()

    if args.test_negative:
        success = run_negative_tests()
        sys.exit(0 if success else 1)

    # First run negative self-tests to prove validator works
    run_negative_tests()

    print(f"[*] Scanning target path for credential hygiene: {args.target}")
    violations = scan_directory(args.target)

    if violations:
        print(f"\n[FAIL-CLOSED CRITICAL] {len(violations)} credential hygiene violation(s) detected:")
        for v in violations:
            print(f"  - {v['file']}:{v['line']} [{v['rule']}] {v['desc']} (Snippet: {v['snippet']})")
        sys.exit(1)
    else:
        print(f"[OK] PASS: Zero credential hygiene violations found in {args.target}")
        sys.exit(0)


if __name__ == "__main__":
    main()
