"""Explicit opt-in, fresh-only contract resources; never removes old networks."""
import argparse,ipaddress,json,subprocess
from pathlib import Path
from prepare_p123_headless import prepare
a=argparse.ArgumentParser();a.add_argument('--manifest',required=True);a.add_argument('--allow-new-test-resources',action='store_true');v=a.parse_args()
assert v.allow_new_test_resources,'Explicit fresh-resource mutation opt-in required'
ids=subprocess.check_output(['docker','network','ls','-q'],text=True).split()
networks=json.loads(subprocess.check_output(['docker','network','inspect',*ids],text=True))
used=[ipaddress.ip_network(c['Subnet']) for n in networks for c in (n['IPAM'].get('Config') or []) if c.get('Subnet')]
choice=None
for octet in range(1,251,3):
 nets=[ipaddress.ip_network(f'10.246.{octet+i}.0/24') for i in range(3)]
 if not any(x.overlaps(y) for x in nets for y in used if x.version==y.version):choice=nets;break
assert choice
prepare(v.manifest);path=Path(v.manifest);m=json.loads(path.read_text(encoding='utf-8'))
with Path(m['env_file']).open('a',encoding='utf-8',newline='\n') as f:
 for key,net in zip(['WORKER','UPSTREAM','EDGE'],choice):f.write(f'\nP123_{key}_SUBNET={net}\n')
m.update(subnets=[str(n) for n in choice],explicit_mutation_opt_in=True,scope='FE_CORE_CONTRACT_SPIKE_ONLY')
path.write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8',newline='\n')
print(m['project'])
