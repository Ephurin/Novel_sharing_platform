"""Focused offline checks only. Run from repository root; never calls a provider."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import tempfile
import types

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).with_name('p2-01-closure-evidence')
OUT.mkdir(exist_ok=True)
BASE = '3adab5c73636bd4e7c3dbc6578d4ece0a54b5627'
OLD = 'ad5c9c92c163c43c94d1dbd346aec326d705b19e'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, encoding='utf-8')


sha = git('rev-parse', 'HEAD').strip()
sys.path.insert(0, str(ROOT / 'ai-service'))
probe = []
for ref in [BASE, OLD, sha]:
    source = git('show', ref + ':ai-service/api/schemas.py')
    module = types.ModuleType('compat_probe')
    sys.modules[module.__name__] = module
    exec(compile(source, 'schemas@' + ref, 'exec'), module.__dict__)
    try:
        value = module.IdeaBootstrapRequest(novel_id='fixture-novel', idea='source',
            preferences={'genre': ['fantasy'], 'pacing': 'fast'})
        probe.append({'ref': ref, 'accepted': True,
                      'preferences': value.preferences.model_dump(exclude_none=True)})
    except ValueError as exc:
        probe.append({'ref': ref, 'accepted': False, 'error': str(exc)})
assert [r['accepted'] for r in probe] == [True, False, True]
(OUT / 'base-head-payload-probe.json').write_text(json.dumps(probe, indent=2), encoding='utf-8')
hashes = {path: {ref: hashlib.sha256(git('show', ref + ':' + path).encode()).hexdigest()
                 for ref in [BASE, OLD, sha]}
          for path in ['.github/workflows/p8-cutover.yml',
                       'scripts/run_ai_pipe_03a_autonomous_controller.py']}
assert all(len(set(values.values())) == 1 for values in hashes.values())
(OUT / 'unchanged-ci-paths.json').write_text(json.dumps(hashes, indent=2), encoding='utf-8')

records = []
commands = [
    ('focused', ROOT / 'ai-service', [sys.executable, '-m', 'pytest', '-q', '-rs',
     '-p', 'no:cacheprovider', '--basetemp=' + tempfile.mkdtemp(prefix='p2-closure-'),
     '--junitxml=' + str(OUT / 'focused.xml'),
     'tests/test_p2_bootstrap_pacing_compat.py', 'tests/test_p2_bootstrap_guard.py',
     'tests/test_p2_json_bootstrap_compat.py', 'tests/test_idea_bootstrap_routes.py',
     'tests/test_manuscript_bootstrap.py', 'tests/test_manuscript_bootstrap_routes.py']),
    ('pg-collection-only', ROOT / 'ai-service', [sys.executable, '-m', 'pytest',
     '-o', 'addopts=', '--collect-only', '-q', '-p', 'no:cacheprovider',
     'tests/test_p2_bootstrap_postgres.py']),
    ('docker', ROOT, ['docker', 'version', '--format', '{{.Server.Version}}']),
    ('source-diff', ROOT, ['git', 'diff', '--check', OLD, sha]),
]
for name, cwd, cmd in commands:
    with (OUT / (name + '.log')).open('w', encoding='utf-8') as log:
        result = subprocess.run(cmd, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, timeout=120)
    records.append(dict(name=name, source_sha=sha, command=cmd,
                        cwd=str(cwd.relative_to(ROOT)), exit_code=result.returncode))
    print(name, result.returncode, flush=True)
records.append(dict(name='source-integrity', before=sha, after=git('rev-parse', 'HEAD').strip(),
                    tracked_diff=git('diff', 'HEAD', '--stat')))
(OUT / 'commands.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
