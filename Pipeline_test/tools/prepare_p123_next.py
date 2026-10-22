"""Create fresh isolated next-slice resources, with non-default Docker subnets."""
import argparse
import ipaddress
import json
from pathlib import Path
import secrets
import subprocess
from prepare_p123_headless import prepare

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--manifest',required=True); args=parser.parse_args()
    # Inspect only: never remove historical Docker networks to free default pools.
    ids=subprocess.check_output(['docker','network','ls','-q'],text=True).split()
    existing=json.loads(subprocess.check_output(['docker','network','inspect',*ids],text=True))
    used=[ipaddress.ip_network(c['Subnet']) for n in existing for c in (n['IPAM'].get('Config') or []) if c.get('Subnet')]
    for _ in range(100):
        octet=secrets.randbelow(240)+10
        candidates=[ipaddress.ip_network(f'10.241.{octet+i}.0/24') for i in range(3)]
        if not any(a.overlaps(b) for a in candidates for b in used if a.version==b.version): break
    else: raise RuntimeError('No owned test subnet candidate found')
    prepare(args.manifest)
    manifest=json.loads(Path(args.manifest).read_text(encoding='utf-8'))
    with Path(manifest['env_file']).open('a',encoding='utf-8') as stream:
        for key,net in zip(('WORKER','UPSTREAM','EDGE'),candidates): stream.write(f'\nP123_{key}_SUBNET={net}\n')
    manifest['subnets']=[str(c) for c in candidates]
    Path(args.manifest).write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
