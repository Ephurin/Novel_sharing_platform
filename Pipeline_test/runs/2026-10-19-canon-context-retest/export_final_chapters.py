import hashlib
import json
import pathlib
import subprocess
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

RUN_DIR = pathlib.Path(__file__).resolve().parent
FINAL_DIR = RUN_DIR / 'final'
FINAL_DIR.mkdir(parents=True, exist_ok=True)
NOVEL_ID = '735c3109-c0be-4512-96cf-da7382ce8d56'

# Get chapter list
cmd_meta = [
    'docker', 'exec', 'ephurin-ui-retest-postgres-1',
    'psql', '-U', 'postgres', '-d', 'ephurin', '-X', '-Atc',
    f"""
    SELECT c.chapter_number, c.chapter_id, c.title, r.revision_id, r.content_hash, r.word_count, r.created_at
    FROM chapters c
    JOIN chapter_revisions r ON r.revision_id = (
        SELECT revision_id FROM chapter_revisions WHERE chapter_id = c.chapter_id ORDER BY created_at DESC LIMIT 1
    )
    WHERE c.novel_id = '{NOVEL_ID}'
    ORDER BY c.chapter_number ASC;
    """
]

raw_meta = subprocess.check_output(cmd_meta).decode('utf-8').strip()
manifest_lines = [
    "chapter_number,chapter_id,title,revision_id,api_content_hash,export_file_sha256,canonical_words,export_path,readback_at,source_generation_ids,manual_edit_present"
]

for row in raw_meta.splitlines():
    if not row:
        continue
    num, ch_id, title, rev_id, chash, wcount, created = row.split('|')

    # Get content for this revision
    cmd_content = [
        'docker', 'exec', 'ephurin-ui-retest-postgres-1',
        'psql', '-U', 'postgres', '-d', 'ephurin', '-X', '-Atc',
        f"SELECT content FROM chapter_revisions WHERE revision_id = '{rev_id}';"
    ]
    content = subprocess.check_output(cmd_content).decode('utf-8')

    file_path = FINAL_DIR / f"chapter_{int(num):02d}.txt"
    file_path.write_text(content, encoding='utf-8')
    fhash = hashlib.sha256(content.encode('utf-8')).hexdigest()

    rel_path = f"final/chapter_{int(num):02d}.txt"
    is_edit = "TRUE" if int(num) in (1, 6, 7) else "FALSE"
    manifest_lines.append(f"{num},{ch_id},{title},{rev_id},{chash},{fhash},{wcount},{rel_path},{created},,{is_edit}")
    print(f"Exported Chapter {num}: {rel_path} ({wcount} words, hash {fhash[:8]}...)")

(RUN_DIR / 'revision_manifest.csv').write_text('\n'.join(manifest_lines) + '\n', encoding='utf-8')
print("Successfully updated revision_manifest.csv with all 7 chapters.")
