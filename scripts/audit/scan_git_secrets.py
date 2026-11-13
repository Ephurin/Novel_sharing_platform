"""Full-history Git diff secret and credential scanner for public readiness audit.

Scans added/modified diff lines across reachable refs (git log -p [refs...] --full-history).
SCOPE AND BOUNDARIES:
- Scans text diffs of added lines; does NOT scan raw uncommitted Git blobs, binary objects,
  or calculate Shannon entropy. (Offline tool 'detect-secrets' is available for ad-hoc inspection,
  while this script provides the committed, deterministic diff scan).
- Frozen Audit Baseline Snapshot: By default, pins the audit PR branch to commit
  `07b3a7487ab462b0532ecfc4dbaf0ffa4fab331b` across all repository refs. This ensures
  reproducible 340-finding verification without self-referential expansion from subsequent
  audit report/manifest additions. Pass '--all' to scan all active branch tips dynamically.
- Outputs strictly redacted and anonymized findings with zero author email/PII data.
- Fails closed (non-zero exit) if git subprocess encounters an error.
"""

import subprocess
import re
import json
import sys
from pathlib import Path

FROZEN_AUDIT_SNAPSHOT_REF = "07b3a7487ab462b0532ecfc4dbaf0ffa4fab331b"

# Sensitive patterns (defensive scanner rules)
PATTERNS = {
    'Google API Key': re.compile(r'AIza[0-9A-Za-z\-_]{35}'),
    'OpenAI API Key': re.compile(r'sk-(?:proj-|admin-)?[a-zA-Z0-9_\-]{20,}'),
    'Anthropic API Key': re.compile(r'sk-ant-[a-zA-Z0-9_\-]{20,}'),
    'AWS Access Key': re.compile(r'(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}'),
    'GitHub Token': re.compile(r'(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}|github_pat_[A-Za-z0-9_]{82}'),
    'Private Key': re.compile(r'-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY'),
    'Zalo / AQ Key': re.compile(r'AQ\.[A-Za-z0-9_\-]{40,}'),
    'Slack Token': re.compile(r'xox[baprs]-[0-9A-Za-z\-]{10,}'),
    'Stripe Key': re.compile(r'(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24}'),
    'HuggingFace Token': re.compile(r'hf_[a-zA-Z0-9]{34}'),
    'Database URI with Credentials': re.compile(r'(?:postgres|postgresql|mongodb|mysql|redis):\/\/[a-zA-Z0-9_\.\-]+:([^@\s\/]{3,})@'),
    'Generic Secret Assignment': re.compile(r'(?i)(?:api_key|apikey|secret_key|private_key|auth_token|access_token|password|db_pass)\s*[:=]\s*["\']([^"\']{8,})["\']'),
    'JWT Token': re.compile(r'eyJ[A-Za-z0-9_\-]{15,}\.[A-Za-z0-9_\-]{15,}\.[A-Za-z0-9_\-]+')
}

MOCK_INDICATORS = [
    'example', 'placeholder', 'dummy', 'mock', 'test', 'fixture', 'changeme',
    'your_', 'sample', 'redacted', 'xxx', 'fake', '<your', '${', 'env(', 'os.environ'
]

def mask_secret(secret_str):
    if len(secret_str) <= 8:
        return '****'
    return secret_str[:4] + '****' + secret_str[-4:]

def get_scan_refs(target=None):
    if target == '--all':
        return ['--all']
    if target and target != FROZEN_AUDIT_SNAPSHOT_REF:
        return [target]
        
    # Pinned audit snapshot: all refs with audit PR branch pinned at 07b3a7487a
    # This avoids self-referential expansion from subsequent audit manifests/reports.
    res = subprocess.run(['git', 'for-each-ref', '--format=%(refname)'], capture_output=True, text=True, check=True)
    refs = res.stdout.splitlines()
    target_refs = [r for r in refs if 'public-01b-evidence-closure' not in r]
    target_refs.append(FROZEN_AUDIT_SNAPSHOT_REF)
    return target_refs

def run(target=None):
    target_refs = get_scan_refs(target)
    desc = target if target else f"frozen snapshot {FROZEN_AUDIT_SNAPSHOT_REF[:10]}"
    print(f"Starting Git history diff scan (target: {desc})...")
    
    cmd = ['git', 'log', '-p'] + target_refs + ['--full-history', '--date=iso']
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
    
    current_commit = None
    current_date = None
    current_file = None
    findings = []
    
    commit_re = re.compile(r'^commit ([0-9a-f]{40})')
    date_re = re.compile(r'^Date:\s*(.*)')
    file_diff_re = re.compile(r'^\+\+\+ b/(.*)')
    
    for line in proc.stdout:
        m_commit = commit_re.match(line)
        if m_commit:
            current_commit = m_commit.group(1)
            current_file = None
            continue
            
        m_date = date_re.match(line)
        if m_date:
            current_date = m_date.group(1).strip()
            continue
            
        m_file = file_diff_re.match(line)
        if m_file:
            current_file = m_file.group(1).strip()
            continue
            
        if line.startswith('+') and not line.startswith('+++'):
            added_text = line[1:].strip()
            if not added_text:
                continue
                
            for pattern_name, pattern in PATTERNS.items():
                for match in pattern.finditer(added_text):
                    matched_val = match.group(0)
                    lower_val = matched_val.lower()
                    lower_line = added_text.lower()
                    
                    is_mock = any(m in lower_val or m in lower_line for m in MOCK_INDICATORS)
                    
                    if pattern_name == 'Generic Secret Assignment':
                        secret_val = match.group(1)
                        if any(m in secret_val.lower() for m in MOCK_INDICATORS):
                            is_mock = True
                        if len(secret_val) < 8:
                            continue
                            
                    masked = mask_secret(matched_val)
                    
                    # Privacy preservation: omit author name and email completely
                    findings.append({
                        'commit': current_commit,
                        'commit_short': current_commit[:10] if current_commit else None,
                        'date': current_date,
                        'file': current_file,
                        'type': pattern_name,
                        'masked': masked,
                        'is_likely_mock_or_test': is_mock
                    })

    proc.stdout.close()
    stderr_output = proc.stderr.read()
    proc.stderr.close()
    proc.wait()
    
    if proc.returncode != 0:
        print(f"ERROR: git log exited with non-zero code {proc.returncode}", file=sys.stderr)
        print(f"Stderr: {stderr_output}", file=sys.stderr)
        sys.exit(proc.returncode)
        
    print(f"Scan complete. Total findings: {len(findings)}")
    return findings

if __name__ == '__main__':
    target_arg = sys.argv[1] if len(sys.argv) > 1 else None
    findings = run(target_arg)
    out_file = Path("docs/development/security/git_secret_findings.redacted.json")
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(findings, f, indent=2, ensure_ascii=False)
    print(f"Redacted findings written to {out_file}")
