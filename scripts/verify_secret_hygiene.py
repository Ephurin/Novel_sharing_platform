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
        re.compile(r'Bearer\s+(?!\[REDACTED\]|token|\{token\}|<token>|\{authorToken\})[A-Za-z0-9_\-\.]{15,}'),
        "Live Bearer token detected"
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
        "RAW_SECRET_NOTE_LEAK_IN_MANIFEST",
        re.compile(r'"(?:author_secret_note|private_author_notes|private_note_raw)"\s*:\s*"(?!(?:\[REDACTED\]|""))[^"]{8,}"', re.I),
        "Raw author private secret note leaked in manifest/evidence"
    ),
]

SAFE_EXTENSIONS = {".json", ".md", ".txt", ".mjs", ".ts", ".py"}


def scan_file(file_path):
    """Scan a single file for credential hygiene violations."""
    violations = []
    try:
        content = pathlib.Path(file_path).read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        return [{"file": str(file_path), "line": 0, "rule": "READ_ERROR", "msg": str(exc)}]

    lines = content.splitlines()
    for idx, line in enumerate(lines, start=1):
        for rule_id, regex, desc in RULES:
            match = regex.search(line)
            if match:
                # Truncate snippet to avoid printing the secret in the scan report
                matched_snippet = match.group(0)[:12] + "..."
                violations.append({
                    "file": str(file_path),
                    "line": idx,
                    "rule": rule_id,
                    "desc": desc,
                    "snippet": matched_snippet
                })
    return violations


def scan_directory(target_dir):
    """Recursively scan a directory for public artifact violations."""
    all_violations = []
    target_path = pathlib.Path(target_dir).resolve()

    if target_path.is_file():
        return scan_file(target_path)

    for root, _, files in os.walk(target_path):
        # Exclude git directories, node_modules, and python caches
        if any(ignored in root for ignored in [".git", "node_modules", "__pycache__", ".pytest_tmp"]):
            continue
        for f in files:
            p = pathlib.Path(root) / f
            if p.suffix.lower() in SAFE_EXTENSIONS:
                violations = scan_file(p)
                all_violations.extend(violations)
    return all_violations


def run_negative_tests():
    """Negative self-tests to prove validator catches tokens and passwords."""
    print("[*] Running Secret Hygiene Negative Self-Tests...")

    # Test 1: Catch simulated JWT
    synthetic_jwt = '{"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"}'
    v1 = []
    for rule_id, regex, desc in RULES:
        if regex.search(synthetic_jwt):
            v1.append(rule_id)
    assert "JWT_ACCESS_TOKEN" in v1, "Validator failed to catch synthetic JWT!"
    print("    [OK] Negative Test 1 Passed: Synthetic JWT detected successfully")

    # Test 2: Catch plaintext password in JSON
    synthetic_pass = '{\n  "username": "tester",\n  "password": "StrongSecretPassword123!"\n}'
    v2 = []
    for rule_id, regex, desc in RULES:
        if regex.search(synthetic_pass):
            v2.append(rule_id)
    assert "PLAINTEXT_PASSWORD_FIELD" in v2, "Validator failed to catch plaintext password!"
    print("    [OK] Negative Test 2 Passed: Plaintext password in JSON detected successfully")

    # Test 3: Catch raw secret note
    synthetic_note = '{\n  "author_secret_note": "BÍ MẬT TÁC GIẢ (CHỈ DÀNH CHO OUTLINE): Lâm Phong là huyết mạch Ma Thần"\n}'
    v3 = []
    for rule_id, regex, desc in RULES:
        if regex.search(synthetic_note):
            v3.append(rule_id)
    assert "RAW_SECRET_NOTE_LEAK_IN_MANIFEST" in v3, "Validator failed to catch leaked raw secret note!"
    print("    [OK] Negative Test 3 Passed: Leaked author secret note detected successfully")

    # Test 4: Catch private_author_notes leakage in JSON
    synthetic_private = '{\n  "private_author_notes": "Bí mật Ma Thần không được công khai"\n}'
    v4 = []
    for rule_id, regex, desc in RULES:
        if regex.search(synthetic_private):
            v4.append(rule_id)
    assert "RAW_SECRET_NOTE_LEAK_IN_MANIFEST" in v4, "Validator failed to catch leaked private_author_notes!"
    print("    [OK] Negative Test 4 Passed: Leaked private_author_notes detected successfully")

    # Test 5: Allow sanitized manifest
    sanitized_manifest = json.dumps({
        "manifest_type": "P1_DEMO_FIXTURE_PUBLIC_MANIFEST",
        "novel": {"novel_id": "11111111-1111-1111-1111-111111111111", "title": "Đại Lục Tinh Thần"},
        "author": {"username": "author_demo"},
        "chapters": [{"chapter_id": "22222222-2222-2222-2222-222222222222", "title": "Chương 1"}],
        "stages": {"basic_fixture": "BASIC_FIXTURE_READY", "canon_fixture": "CANON_FIXTURE_PENDING_HITL"}
    })
    v5 = []
    for rule_id, regex, desc in RULES:
        if regex.search(sanitized_manifest):
            v5.append(rule_id)
    assert len(v5) == 0, f"Validator falsely flagged clean sanitized manifest: {v5}"
    print("    [OK] Positive Test 5 Passed: Sanitized manifest passed with zero violations")

    print("\n[OK] All 5 Secret Hygiene Negative/Positive Self-Tests PASSED!\n")
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
