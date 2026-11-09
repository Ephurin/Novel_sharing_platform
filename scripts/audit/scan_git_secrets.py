"""Full-history Git secret and credential scanner for public readiness audit.

Scans all commits, trees, and diffs across all reachable refs.
All findings are emitted in redacted / masked form.
"""

import subprocess
import re
import json
import sys
from pathlib import Path

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

def run():
    print("Starting Git history scan across all commits and branches...")
    cmd = ['git', 'log', '-p', '--all', '--full-history', '--date=iso']
    
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
    
    current_commit = None
    current_author = None
    current_date = None
    current_file = None
    findings = []
    
    commit_re = re.compile(r'^commit ([0-9a-f]{40})')
    author_re = re.compile(r'^Author:\s*(.*)')
    date_re = re.compile(r'^Date:\s*(.*)')
    file_diff_re = re.compile(r'^\+\+\+ b/(.*)')
    
    line_num = 0
    for line in proc.stdout:
        line_num += 1
        m_commit = commit_re.match(line)
        if m_commit:
            current_commit = m_commit.group(1)
            current_file = None
            continue
            
        m_auth = author_re.match(line)
        if m_auth:
            current_author = m_auth.group(1).strip()
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
                    
                    findings.append({
                        'commit': current_commit,
                        'author': current_author,
                        'date': current_date,
                        'file': current_file,
                        'type': pattern_name,
                        'masked': masked,
                        'is_likely_mock_or_test': is_mock
                    })

    proc.stdout.close()
    proc.wait()
    
    print(f"Scan complete. Total findings: {len(findings)}")
    return findings

if __name__ == '__main__':
    findings = run()
    out_file = Path("docs/development/security/git_secret_findings.redacted.json")
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(findings, f, indent=2, ensure_ascii=False)
    print(f"Redacted findings written to {out_file}")
