import json
import pathlib
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

raw_proposals = json.load(open('Pipeline_test/runs/2026-10-19-canon-context-retest/evidence/raw-proposals.json', encoding='utf-8'))

keywords = ['sơn xanh', 'móc', 'cv-04', 'quét', 'phổ', 'chuông', 'nếu', 'tai', 'hộp', 'vết nứt', 'mảnh gốm']

for kw in keywords:
    matches = []
    for p in raw_proposals:
        s = json.dumps(p, ensure_ascii=False).lower()
        if kw in s:
            matches.append((p.get('proposal_type'), p.get('payload'), p.get('evidence')))
    print(f"\n=== Keyword '{kw}': {len(matches)} matches ===")
    for pt, payload, ev in matches[:4]:
        print(f"  [{pt}] Payload: {payload}")
        if ev:
            print(f"        Evidence: {ev}")
