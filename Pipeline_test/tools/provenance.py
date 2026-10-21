"""Strict consistency checks, NOT cryptographic proof that a browser was driven."""
from datetime import datetime
import hashlib
import io
import json
from pathlib import Path
from urllib.parse import urlparse
import zipfile

from Pipeline_test.tools.manuscript_fixture import FIXTURE_DIR, parse_fixture_chapter, CONVERSION_RULE_VERSION


def verify_manuscript_gold_hashes(chapters, fixture_dir=None, *, expected_novel_id=None, expected_owner_id=None):
    if len(chapters) != 5: return False, f'Expected exactly 5 chapters, found {len(chapters)}'
    if not expected_novel_id or not expected_owner_id: return False, 'Verified novel/owner scope is required'
    seen = set()
    for index, chapter in enumerate(chapters, 1):
        cid = chapter.get('chapterId') or chapter.get('id')
        rid = chapter.get('latestRevisionId') or chapter.get('revisionId')
        if type(chapter.get('chapterNumber')) is not int or chapter['chapterNumber'] != index:
            return False, f'Chapter {index} numbering/order is invalid'
        if not cid or not rid or cid == rid or cid in seen or rid in seen:
            return False, f'Chapter {index} missing, duplicate or identical chapter/revision_id'
        seen.update([cid, rid])
        if chapter.get('novelId') != expected_novel_id or chapter.get('ownerId') != expected_owner_id:
            return False, f'Chapter {index} ownership/scope mismatch'
        revision = chapter.get('canonicalRevision') or {}
        if (revision.get('revisionId') != rid or revision.get('chapterId') != cid or
            revision.get('novelId') != expected_novel_id or not isinstance(revision.get('content'), str)):
            return False, f'Chapter {index} canonical readback missing or stale revision'
        try:
            fixture = parse_fixture_chapter(index, fixture_dir=fixture_dir or FIXTURE_DIR)
        except (ValueError, UnicodeError, OSError) as exc:
            return False, f'Chapter {index} invalid source fixture: {exc}'
        for record in (chapter, revision):
            if record.get('conversion_rule_version',CONVERSION_RULE_VERSION) != CONVERSION_RULE_VERSION:
                return False, f'Chapter {index} unknown source normalization'
        expected_hash = fixture['canonical_body_sha256']
        server_hash = chapter.get('contentHash') or chapter.get('latestRevisionHash')
        if chapter.get('title') != fixture['title']:
            return False, f'Chapter {index} fixture title mismatch'
        if not server_hash or not revision.get('contentHash'):
            return False, f'Chapter {index} missing canonical content hash'
        if (server_hash != expected_hash or revision['contentHash'] != expected_hash or
            revision['content'] != fixture['body'] or hashlib.sha256(revision['content'].encode('utf-8')).hexdigest() != expected_hash):
            return False, f'Chapter {index} content hash mismatch'
    return True, 'All 5 chapters match gold fixture hashes after heading-to-body conversion and canonical owner/revision readback'


def validate_browser_evidence(response_evidence, action_id, novel_id, run_dir=None, *, expected_run_id=None,
                              expected_user_id=None, expected_session_id=None):
    try:
        from PIL import Image
        if not response_evidence: raise ValueError('Missing browser evidence')
        root = Path(run_dir).resolve()
        path = Path(response_evidence)
        path = path.resolve() if path.is_absolute() else (root / path).resolve()
        if not path.is_relative_to(root): raise ValueError('Evidence escapes run directory')
        if path.suffix != '.json': path = path.with_suffix('.json')
        manifest = json.loads(path.read_text(encoding='utf-8'))
        if not all((expected_run_id, expected_user_id, expected_session_id)):
            raise ValueError('Expected run/user/browser session scope required')
        for key, value in [('action_id', action_id), ('novel_id', novel_id), ('run_id', expected_run_id),
                           ('user_id', expected_user_id), ('session_id', expected_session_id)]:
            if manifest.get(key) != value: raise ValueError(f'Mismatched or missing {key}')
        if manifest.get('channel') != 'OFFLINE_BROWSER_UI_SMOKE': raise ValueError('Incorrect evidence scope')
        if manifest.get('action_kind') not in {'click', 'fill', 'upload', 'navigate', 'press'}:
            raise ValueError('Missing real browser action kind')
        url = urlparse(manifest['application_url'])
        if url.scheme != 'http' or url.hostname not in {'localhost', '127.0.0.1'} or not manifest.get('selector'):
            raise ValueError('Invalid isolated application URL/selector')
        start = datetime.fromisoformat(manifest['started_at']); end = datetime.fromisoformat(manifest['finished_at'])
        if not start.tzinfo or not end.tzinfo or start > end: raise ValueError('Orphaned or inverted timestamps')
        artifacts = {}
        for kind in ('screenshot', 'trace', 'dom', 'readback', 'session'):
            ref = manifest['artifacts'][kind]
            artifact = (root / ref['path']).resolve()
            if not artifact.is_relative_to(root): raise ValueError('Artifact escapes run')
            data = artifact.read_bytes()
            if not data or hashlib.sha256(data).hexdigest() != ref['sha256']: raise ValueError('Artifact missing/hash mismatch')
            artifacts[kind] = data
        image = Image.open(io.BytesIO(artifacts['screenshot']))
        if image.format != 'PNG' or image.width < 320 or image.height < 200:
            raise ValueError('Synthetic/minimal screenshot does not qualify')
        image.verify()
        session = json.loads(artifacts['session'])
        if session.get('session_id') != expected_session_id or not session.get('browser_version'):
            raise ValueError('Browser execution session missing')
        readback = json.loads(artifacts['readback'])
        for key, value in [('novel_id', novel_id), ('user_id', expected_user_id),
                           ('run_id', expected_run_id), ('session_id', expected_session_id)]:
            if readback.get(key) != value: raise ValueError('Server readback scope mismatch')
        if readback.get('action_id') != action_id: raise ValueError('Uncorrelated server readback')
        ok, reason = verify_manuscript_gold_hashes(readback['chapters'], expected_novel_id=novel_id,
                                                   expected_owner_id=expected_user_id)
        if not ok: raise ValueError(reason)
        with zipfile.ZipFile(io.BytesIO(artifacts['trace'])) as archive:
            events = []
            network = []
            for name in archive.namelist():
                if name.endswith('.trace'):
                    events.extend(json.loads(line) for line in archive.read(name).splitlines() if line)
                elif name.endswith('.network'):
                    network.extend(json.loads(line) for line in archive.read(name).splitlines() if line)
            groups = [e for e in events if e.get('type') == 'before' and
                      e.get('method') == 'tracingGroup' and
                      (e.get('title') == action_id or e.get('params', {}).get('name') == action_id)]
            group_ids = {e.get('callId') for e in groups}
            actions = [e for e in events if e.get('type') == 'before' and
                       e.get('parentId') in group_ids and
                       (e.get('method', '').lower() in ('click', 'fill', 'goto', 'reload', 'setinputfiles', 'press') or
                        any(word in str(e.get('apiName', '')).lower() for word in ('click', 'fill', 'goto', 'reload', 'setinputfiles', 'press')))]
            completed = {e.get('callId') for e in events if e.get('type') == 'after' and not e.get('error')}
            if not groups or not any(e.get('callId') in completed for e in actions) or not network:
                raise ValueError('Static/missing browser execution trace or network readback')
        return True, 'Consistent executed-browser artifact bundle; not cryptographic authenticity'
    except Exception as exc:
        return False, str(exc)
