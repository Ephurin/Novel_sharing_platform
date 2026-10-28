"""Redact credentials from a Playwright trace without changing screenshots/structure.

Private secrets arrive on stdin, never argv. Only redacted output is publishable.
"""
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

JWT = re.compile(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+')
BEARER = re.compile(r'Bearer\s+[A-Za-z0-9_\-\.]{15,}', re.I)
SENSITIVE = re.compile(r'password|authorization|cookie|access.?token|refresh.?token|secret|api.?key|author_notes|private_author_notes|prompt_text', re.I)
PRIVATE_NOTE_KEY = re.compile(r'author_notes|private_author_notes', re.I)


def sanitize_trace(source, target, secrets):
    secrets = sorted({s for s in secrets if isinstance(s, str) and len(s) >= 8}, key=len, reverse=True)
    def text(value):
        for secret in secrets:
            value = value.replace(secret, '[REDACTED]')
        value = JWT.sub('[REDACTED_JWT]', value)
        value = BEARER.sub('Bearer [REDACTED_TOKEN]', value)
        return value
    def clean(value):
        if isinstance(value, dict):
            header = SENSITIVE.search(str(value.get('name', '')))
            res = {}
            for key, item in value.items():
                if PRIVATE_NOTE_KEY.search(key):
                    res[key] = '[REDACTED_PRIVATE_NOTE]'
                elif isinstance(item, str) and (SENSITIVE.search(key) or (header and key == 'value')):
                    res[key] = '[REDACTED]'
                else:
                    res[key] = clean(item)
            return res
        if isinstance(value, list):
            return [clean(item) for item in value]
        return text(value) if isinstance(value, str) else value
    count = 0
    binary_images_stripped = 0
    with ZipFile(source) as old, ZipFile(target, 'w', compression=ZIP_DEFLATED) as new:
        for entry in old.infolist():
            if entry.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                binary_images_stripped += 1
                continue
            raw = old.read(entry.filename)
            try:
                decoded = raw.decode('utf8')
            except UnicodeDecodeError:
                new.writestr(entry, raw)
                continue
            lines = []
            for line in decoded.splitlines(keepends=True):
                try:
                    lines.append(json.dumps(clean(json.loads(line)), ensure_ascii=False) + '\n')
                except (ValueError, TypeError):
                    lines.append(text(line))
            safe = ''.join(lines)
            assert not JWT.search(safe) and not any(secret in safe for secret in secrets), entry.filename
            new.writestr(entry, safe.encode('utf8')); count += 1
    return {'credential_scan': 'PASS', 'text_entries_sanitized': count, 'binary_images_stripped': binary_images_stripped, 'binary_images_remaining': 0}


if __name__ == '__main__':
    secrets = json.load(sys.stdin)
    print(json.dumps(sanitize_trace(Path(sys.argv[1]), Path(sys.argv[2]), secrets)))
