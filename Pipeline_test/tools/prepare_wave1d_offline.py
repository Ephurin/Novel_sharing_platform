"""Prepare NEW offline env/run files only. Does not start Docker or touch old state."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import secrets
import socket
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def prepare(project, run_id):
    if not re.fullmatch(r'p1-wave1[def]-[a-z0-9-]+', project): raise ValueError('Unique p1-wave1d project required')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', run_id) or not any(w in run_id.lower() for w in ('wave1d','wave1e','wave1f')):
        raise ValueError('New Wave1D run ID required')
    run = ROOT / 'Pipeline_test/runs' / run_id
    env_file = ROOT / 'Pipeline_test/tools' / ('.env.' + project)
    if run.exists() or env_file.exists(): raise FileExistsError('Never overwrite or reuse a previous run/env')
    ports = {}
    sockets = []
    try:
        for key in ('WEB', 'BACKEND', 'AI', 'GATE', 'FAKE'):
            sock = socket.socket(); sock.bind(('127.0.0.1', 0)); sockets.append(sock)
            ports['WAVE1D_' + key + '_PORT'] = str(sock.getsockname()[1])
    finally:
        for sock in sockets: sock.close()
    values = {'WAVE1D_PROJECT': project, 'POSTGRES_DB': project.replace('-', '_'),
        'POSTGRES_USER': 'wave1d', 'POSTGRES_PASSWORD': secrets.token_hex(24),
        'JWT_ACCESS_SECRET': secrets.token_hex(32), 'JWT_REFRESH_SECRET': secrets.token_hex(32),
        'PLATFORM_SERVICE_TOKEN': secrets.token_hex(32), 'AI_WORKER_TOKEN': secrets.token_hex(24),
        'BACKEND_WORKER_TOKEN': secrets.token_hex(24), 'OFFLINE_UPSTREAM_KEY': secrets.token_hex(24),
        'WAVE1D_AUTHOR_EMAIL': project + '@example.invalid',
        'WAVE1D_AUTHOR_USERNAME': project.replace('-', '_'),
        'WAVE1D_AUTHOR_PASSWORD': 'W1d!' + secrets.token_hex(20), **ports}
    run.mkdir(parents=True, exist_ok=False)
    with env_file.open('x', encoding='utf-8') as stream:
        stream.write('# Local offline-only credentials; DO NOT COMMIT\n')
        stream.write('\n'.join(k + '=' + v for k, v in values.items()) + '\n')
    manifest = {'project': project, 'run_id': run_id, 'env_file': str(env_file.relative_to(ROOT)),
        'ports': ports, 'env_sha256': hashlib.sha256(env_file.read_bytes()).hexdigest(),
        'source_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'runtime_started': False, 'container_ownership': 'NOT_YET_OBSERVED',
        'external_provider_calls': 0, 'mode': 'OFFLINE_FAKE_UPSTREAM_ONLY'}
    (run / 'offline-environment.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--project', required=True); parser.add_argument('--run-id', required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.project, args.run_id), indent=2))
