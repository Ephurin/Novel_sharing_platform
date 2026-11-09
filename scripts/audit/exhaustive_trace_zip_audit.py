"""Exhaustive stream audit of Playwright trace ZIP archives for public readiness.

Scans all members across all 4 tracked trace archives.
Redacts all sensitive items and outputs safe aggregate claims.
"""

import zipfile
import json
import base64
import re
from pathlib import Path

TARGET_ZIPS = [
    "docs/development/PR-54-55-REVIEW/draft-trace.zip",
    "docs/development/integration/p1-author/evidence/playwright-trace-s09-s11.zip",
    "docs/development/integration/p1-author/final-fe-acceptance/evidence/browser/playwright-trace.zip",
    "docs/development/integration/p1-author/final-fe-acceptance/evidence/components/draft-persistence-browser/draft-trace.zip"
]

EMAIL_RE = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b')
JWT_RE = re.compile(r'eyJ[A-Za-z0-9_\-]{15,}\.[A-Za-z0-9_\-]{15,}\.[A-Za-z0-9_\-]+')
PASSWORD_RE = re.compile(r'(?i)"password"\s*:\s*"([^"]+)"')
PHONE_RE = re.compile(r'(?:\+84|0)(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}\b')

TEST_DOMAINS = {'example.com', 'example.invalid', 'example.org', 'test.local', 'localhost'}

def decode_jwt_safe(token):
    try:
        parts = token.split('.')
        if len(parts) >= 2:
            padded = parts[1] + '=' * (4 - len(parts[1]) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded).decode('utf-8', errors='replace'))
            return {
                'iss': payload.get('iss', 'none'),
                'aud': payload.get('aud', 'none'),
                'role': payload.get('role', 'none'),
                'sub_is_uuid': bool(re.match(r'^[0-9a-f\-]{36}$', str(payload.get('sub', '')))),
                'has_email': 'email' in payload,
                'email_domain': payload.get('email', '').split('@')[-1] if '@' in payload.get('email', '') else None
            }
    except Exception:
        pass
    return None

def audit_zip(zip_rel_path, base_dir=Path(".")):
    zip_full_path = base_dir / zip_rel_path
    if not zip_full_path.exists():
        return {'status': 'NOT_FOUND'}
        
    stats = {
        'path': zip_rel_path,
        'size_bytes': zip_full_path.stat().st_size,
        'total_entries': 0,
        'scanned_text_entries': 0,
        'binary_entries': 0,
        'emails_synthetic': set(),
        'emails_potential_real': set(),
        'jwt_count': 0,
        'jwt_contexts': [],
        'passwords_count': 0,
        'passwords_redacted_or_fixture': 0,
        'phone_numbers_found': []
    }
    
    with zipfile.ZipFile(zip_full_path, 'r') as z:
        infolist = z.infolist()
        stats['total_entries'] = len(infolist)
        
        for entry in infolist:
            name = entry.filename.lower()
            if any(name.endswith(ext) for ext in ['.png', '.jpeg', '.jpg', '.webp', '.gif', '.zip']):
                stats['binary_entries'] += 1
                continue
                
            try:
                raw = z.read(entry)
                try:
                    text = raw.decode('utf-8')
                except UnicodeDecodeError:
                    text = raw.decode('latin-1', errors='replace')
                    
                stats['scanned_text_entries'] += 1
                
                # Scan Emails
                for m in EMAIL_RE.findall(text):
                    if m.endswith('.jpeg') or m.endswith('.jpg') or m.endswith('.png'):
                        continue
                    domain = m.split('@')[-1].lower()
                    if domain in TEST_DOMAINS:
                        stats['emails_synthetic'].add(m)
                    else:
                        stats['emails_potential_real'].add(m[:2] + '****@' + domain)
                        
                # Scan JWTs
                for m in JWT_RE.findall(text):
                    stats['jwt_count'] += 1
                    ctx = decode_jwt_safe(m)
                    if ctx and ctx not in stats['jwt_contexts']:
                        stats['jwt_contexts'].append(ctx)
                        
                # Scan Passwords
                for m in PASSWORD_RE.finditer(text):
                    stats['passwords_count'] += 1
                    pw_val = m.group(1)
                    if pw_val in ['[REDACTED]', '****', 'password123', 'test', 'Test1234!', 'secret']:
                        stats['passwords_redacted_or_fixture'] += 1
                        
                # Scan phone numbers
                for p in PHONE_RE.findall(text):
                    stats['phone_numbers_found'].append(p[:3] + '****' + p[-2:])
            except Exception:
                pass

    stats['emails_synthetic'] = sorted(list(stats['emails_synthetic']))
    stats['emails_potential_real'] = sorted(list(stats['emails_potential_real']))
    return stats

def run():
    results = {}
    for tz in TARGET_ZIPS:
        print(f"Auditing {tz}...")
        res = audit_zip(tz)
        results[tz] = res
        print(f"  Finished {tz}: {res.get('total_entries')} entries ({res.get('scanned_text_entries')} text, {res.get('binary_entries')} binary)")
    return results

if __name__ == '__main__':
    results = run()
    out_file = Path("docs/development/security/trace_zip_audit.redacted.json")
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Redacted audit written to {out_file}")
