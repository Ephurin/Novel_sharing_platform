"""Negative consistency tests only. Manufactured bundles MUST NOT earn E2E PASS."""
import hashlib
import io
import json
from pathlib import Path
import sys
import zipfile
import pytest
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.provenance import validate_browser_evidence
from Pipeline_test.tools.browser_author_driver import BrowserActionSession,execute_browser_s01_import_path
from Pipeline_test.tests.test_partial_import_idempotency import make_gold_chapters


def check(path,root):return validate_browser_evidence(str(path),'A','wave1d-novel',root,
    expected_run_id='r',expected_user_id='wave1d-author',expected_session_id='s')

def test_synthetic_screenshot_writer_and_page_less_driver_are_removed(tmp_path):
    session=BrowserActionSession('r',tmp_path)
    with pytest.raises(RuntimeError,match='SYNTHETIC_EVIDENCE_REMOVED'):
        session.record_browser_step(action_id='A',screenshot_bytes=b'fake')
    with pytest.raises(RuntimeError,match='ACTUAL_BROWSER_REQUIRED'):
        execute_browser_s01_import_path(session)
    assert not list(tmp_path.glob('*.png'))

@pytest.mark.parametrize('manifest', [{}, {'action_id':'A','novel_id':'wave1d-novel','timestamp':'now'},
    {'action_id':'A','run_id':'r','session_id':'s','user_id':'wave1d-author','novel_id':'wave1d-novel','channel':'LIVE_UI'}])
def test_manifest_only_never_qualifies(tmp_path,manifest):
    path=tmp_path/'e.json';path.write_text(json.dumps(manifest))
    assert check(path,tmp_path)[0] is False


def forged_bundle(root,small=False):
    image=io.BytesIO();Image.new('RGB',(1,1) if small else (640,480)).save(image,format='PNG')
    files={'screenshot':image.getvalue(),'dom':b'fabricated UI',
      'session':json.dumps({'session_id':'s','browser_version':'invented'}).encode(),
      'readback':json.dumps({'run_id':'r','session_id':'s','user_id':'wave1d-author','novel_id':'wave1d-novel',
                            'action_id':'A','chapters':make_gold_chapters()}).encode()}
    trace=io.BytesIO()
    with zipfile.ZipFile(trace,'w') as archive:
        archive.writestr('trace.trace',json.dumps({'type':'before','params':{'name':'A'}}))
    files['trace']=trace.getvalue()
    refs={}
    for kind,data in files.items():
        path=root/kind;path.write_bytes(data);refs[kind]={'path':path.name,'sha256':hashlib.sha256(data).hexdigest()}
    m={'action_id':'A','novel_id':'wave1d-novel','run_id':'r','session_id':'s','user_id':'wave1d-author',
       'action_kind':'click','selector':'button','channel':'OFFLINE_BROWSER_UI_SMOKE',
       'application_url':'http://127.0.0.1:28080/author/ide','started_at':'2026-10-21T00:00:00+00:00',
       'finished_at':'2026-10-21T00:00:01+00:00','artifacts':refs}
    path=root/'manifest.json';path.write_text(json.dumps(m));return path,m


def test_forged_static_trace_and_dummy_png_do_not_qualify(tmp_path):
    path,_=forged_bundle(tmp_path)
    ok,reason=check(path,tmp_path)
    assert not ok and 'Static/missing' in reason


def test_minimal_png_with_plausible_manifest_rejected(tmp_path):
    path,_=forged_bundle(tmp_path,small=True)
    ok,reason=check(path,tmp_path)
    assert not ok and 'minimal screenshot' in reason

@pytest.mark.parametrize('field,value',[('action_id','B'),('run_id','old-run'),('session_id','other-browser'),
    ('user_id','someone-else'),('novel_id','other-novel'),('finished_at','2026-10-20T00:00:00+00:00')])
def test_scope_and_orphaned_timestamps_rejected(tmp_path,field,value):
    path,m=forged_bundle(tmp_path);m[field]=value;path.write_text(json.dumps(m))
    assert not check(path,tmp_path)[0]


def test_absent_or_changed_server_readback_rejected(tmp_path):
    path,m=forged_bundle(tmp_path)
    (tmp_path/'readback').unlink()
    assert not check(path,tmp_path)[0]


def test_evidence_escape_is_rejected(tmp_path):
    assert not check(tmp_path.parent/'outside.json',tmp_path)[0]
