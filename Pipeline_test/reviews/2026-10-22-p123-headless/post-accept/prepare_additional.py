"""Owned evidence allocator for exhausted 10.241 pool; never removes networks."""
import ipaddress,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT/'Pipeline_test/tools'))
from prepare_p123_headless import prepare
manifest=Path(sys.argv[1]);assert not manifest.exists()
ids=subprocess.check_output(['docker','network','ls','-q'],text=True).split()
networks=json.loads(subprocess.check_output(['docker','network','inspect',*ids],text=True))
used=[ipaddress.ip_network(c['Subnet']) for n in networks for c in (n['IPAM'].get('Config') or []) if c.get('Subnet')]
for p in Path(__file__).resolve().parent.rglob('*-environment.json'):
 used.extend(ipaddress.ip_network(s) for s in json.loads(p.read_text(encoding='utf-8')).get('subnets',[]))
selected=None
for block in [242,243]:
 for octet in range(1,251,3):
  nets=[ipaddress.ip_network(f'10.{block}.{octet+i}.0/24') for i in range(3)]
  if not any(a.overlaps(b) for a in nets for b in used if a.version==b.version):selected=nets;break
 if selected:break
assert selected,'No isolated owned subnet triple available'
prepare(manifest);m=json.loads(manifest.read_text(encoding='utf-8'))
with (ROOT/m['env_file']).open('a',encoding='utf-8',newline='\n') as stream:
 for key,net in zip(['WORKER','UPSTREAM','EDGE'],selected):stream.write(f'\nP123_{key}_SUBNET={net}\n')
m.update(subnets=[str(n) for n in selected],allocator='post-accept/prepare_additional.py',historical_networks_unchanged=True)
manifest.write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8',newline='\n')
print(m['project'])
