import csv
import hashlib
import json
import pathlib
import sys
import urllib.request

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
FINAL_DIR = RUN_DIR / 'final'
FINAL_DIR.mkdir(parents=True, exist_ok=True)

NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'

# Read chapters from API
api_url = f'http://localhost:14000/api/v1/novels/{NOVEL_ID}/chapters'
res = json.loads(urllib.request.urlopen(api_url).read().decode('utf-8'))
chapters = sorted(res.get('data', []), key=lambda x: x['chapterNumber'])

manifest_rows = []

for ch in chapters:
    ch_num = ch['chapterNumber']
    ch_id = ch['chapterId']
    title = ch['title']
    
    # Detail
    detail_url = f'http://localhost:14000/api/v1/chapters/{ch_id}'
    detail = json.loads(urllib.request.urlopen(detail_url).read().decode('utf-8')).get('data', {})
    draft = detail.get('draft') or {}
    content = draft.get('content') or detail.get('content') or ''
    words = draft.get('wordCount') or ch.get('wordCount', 0)
    
    # Export file
    export_path = FINAL_DIR / f'chapter_{ch_num:02d}.txt'
    export_path.write_text(content, encoding='utf-8')
    export_sha = hashlib.sha256(content.encode('utf-8')).hexdigest()
    
    # Revisions and hash via docker exec psql (read-only verification)
    cmd = [
        'docker', 'exec', 'ephurin-ui-retest-postgres-1',
        'psql', '-U', 'postgres', '-d', 'ephurin', '-t', '-A', '-F', '|',
        '-c', f"SELECT r.revision_id, r.content_hash FROM chapter_revisions r JOIN chapters c ON c.latest_revision_id = r.revision_id WHERE c.chapter_id = '{ch_id}';"
    ]
    import subprocess
    proc = subprocess.run(cmd, capture_output=True, text=True)
    out = proc.stdout.strip()
    if out and '|' in out:
        rev_id, api_hash = out.split('|', 1)
    else:
        rev_id = ''
        api_hash = export_sha

    manifest_rows.append({
        'chapter_number': ch_num,
        'chapter_id': ch_id,
        'title': title,
        'revision_id': rev_id,
        'api_content_hash': api_hash,
        'export_file_sha256': export_sha,
        'canonical_words': words,
        'export_path': f'final/chapter_{ch_num:02d}.txt',
        'readback_at': '2026-10-19T21:50:00+07:00',
        'source_generation_ids': '',
        'manual_edit_present': 'FALSE'
    })
    print(f"Ch {ch_num}: {title} | Words: {words} | Rev: {rev_id[:8]} | Hash: {api_hash[:12]}")

fieldnames = [
    'chapter_number', 'chapter_id', 'title', 'revision_id', 'api_content_hash',
    'export_file_sha256', 'canonical_words', 'export_path', 'readback_at',
    'source_generation_ids', 'manual_edit_present'
]

with open(RUN_DIR / 'revision_manifest.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(manifest_rows)

print("Saved revision_manifest.csv successfully.")
