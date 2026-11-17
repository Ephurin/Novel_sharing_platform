"""Regression self-test verifying secret triage manifest and frozen snapshot integrity.

Ensures:
1. docs/development/security/secret_triage_manifest.json matches git_secret_findings.redacted.json 1-to-1.
2. Frozen snapshot count is exactly 340 detections.
3. Every finding has an assigned disposition (0 unreviewed / missing disposition).
4. SHA-256 hash of findings JSON matches manifest metadata.
5. Zero author email or personal identity strings are emitted.
"""

import json
import hashlib
import re
import sys
from pathlib import Path

FINDINGS_PATH = Path("docs/development/security/git_secret_findings.redacted.json")
MANIFEST_PATH = Path("docs/development/security/secret_triage_manifest.json")

VALID_DISPOSITIONS = {
    'LOCAL_DEV_DISPOSABLE_DB',
    'CONFIRMED_TEST_FIXTURE',
    'REGEX_FALSE_POSITIVE',
    'OWNER_ATTESTED_DELETED',
    'DOCS_EVIDENCE_REFERENCE',
    'SYNTHETIC_TEST_TOKEN',
    'CONFIRMED_REVOKED_OWNER_ATTESTED'
}

def run_verification():
    print("Verifying secret triage manifest integrity against frozen snapshot...")
    
    if not FINDINGS_PATH.exists():
        print(f"ERROR: Findings file missing: {FINDINGS_PATH}", file=sys.stderr)
        return False
    if not MANIFEST_PATH.exists():
        print(f"ERROR: Manifest file missing: {MANIFEST_PATH}", file=sys.stderr)
        return False
        
    with open(FINDINGS_PATH, 'rb') as f:
        findings_bytes = f.read()
    actual_findings_hash = hashlib.sha256(findings_bytes).hexdigest()
    
    with open(FINDINGS_PATH, 'r', encoding='utf-8') as f:
        findings = json.load(f)
        
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
        
    meta = manifest.get('audit_manifest_metadata', {})
    entries = manifest.get('triage_entries', [])
    
    # 1. Snapshot Count Check
    if len(findings) != 340:
        print(f"ERROR: Findings count is {len(findings)}, expected 340", file=sys.stderr)
        return False
    if len(entries) != 340:
        print(f"ERROR: Manifest entries count is {len(entries)}, expected 340", file=sys.stderr)
        return False
        
    # 2. Hash Integrity Check
    manifest_recorded_hash = meta.get('source_findings_sha256')
    if actual_findings_hash != manifest_recorded_hash:
        print(f"ERROR: Findings SHA256 mismatch! Actual: {actual_findings_hash}, Manifest recorded: {manifest_recorded_hash}", file=sys.stderr)
        return False
        
    # 3. 1-to-1 Mapping & Disposition Validation
    missing_dispositions = 0
    invalid_dispositions = 0
    mapping_mismatches = 0
    
    for idx, (f_item, m_entry) in enumerate(zip(findings, entries), 1):
        expected_id = f"FINDING-{idx:03d}"
        if m_entry.get('finding_id') != expected_id:
            mapping_mismatches += 1
            
        # Match core fields
        f_short = f_item.get('commit_short') or (f_item['commit'][:10] if f_item.get('commit') else 'unknown')
        if m_entry.get('commit_short') != f_short:
            mapping_mismatches += 1
        if m_entry.get('file') != f_item.get('file'):
            mapping_mismatches += 1
        if m_entry.get('rule_type') != f_item.get('type'):
            mapping_mismatches += 1
        if m_entry.get('masked_value') != f_item.get('masked'):
            mapping_mismatches += 1
        if m_entry.get('scanner_heuristic_mock') != f_item.get('is_likely_mock_or_test'):
            mapping_mismatches += 1
            
        # Check disposition
        disp = m_entry.get('disposition')
        if not disp or disp == 'UNREVIEWED':
            missing_dispositions += 1
        elif disp not in VALID_DISPOSITIONS:
            invalid_dispositions += 1
            
    if mapping_mismatches > 0:
        print(f"ERROR: {mapping_mismatches} field mismatches between findings and manifest!", file=sys.stderr)
        return False
    if missing_dispositions > 0:
        print(f"ERROR: {missing_dispositions} records missing assigned disposition!", file=sys.stderr)
        return False
    if invalid_dispositions > 0:
        print(f"ERROR: {invalid_dispositions} records have unrecognized disposition!", file=sys.stderr)
        return False
        
    # 4. Privacy Check (No author / personal email)
    for f_item in findings:
        if 'author' in f_item:
            print("ERROR: author field present in findings JSON!", file=sys.stderr)
            return False
            
    manifest_str = json.dumps(manifest)
    email_matches = [m for m in re.findall(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', manifest_str)
                     if 'example.invalid' not in m and 'localhost' not in m and 'postgres' not in m]
    if email_matches:
        print(f"ERROR: Unexpected email pattern detected in manifest: {len(email_matches)} occurrences", file=sys.stderr)
        return False
        
    print(f"PASS: Manifest verified 1-to-1 against frozen snapshot (340 findings, 0 missing disposition).")
    print(f"Snapshot Findings SHA256: {actual_findings_hash}")
    print(f"Breakdown: {meta.get('disposition_breakdown')}")
    return True

if __name__ == '__main__':
    ok = run_verification()
    sys.exit(0 if ok else 1)

