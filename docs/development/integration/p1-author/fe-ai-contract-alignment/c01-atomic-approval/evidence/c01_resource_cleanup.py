"""Stop only containers created by this contract task; preserve every volume."""
import json,pathlib,subprocess,datetime
SCRATCH=pathlib.Path(__file__).parent
PACK=SCRATCH/'c01-evidence-pack'
def cmd(args):
    result=subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace')
    commands.append({'command':args,'exit_code':result.returncode})
    assert result.returncode==0,result.stderr
    return result.stdout
commands=[]
before=sorted(cmd(['docker','volume','ls','--format','{{.Name}}']).splitlines())
resources=[]
for folder in ['c01-red','c01-final']:
    cfg=json.loads((SCRATCH/folder/'resources.json').read_text())
    for name in cfg['containers']:
        row=json.loads(cmd(['docker','inspect',name]))[0]
        assert row['Config']['Labels'].get('astra.task')=='c01-canon-group'
        mounts=[{key:m.get(key) for key in ['Type','Name','Destination','RW']} for m in row['Mounts']]
        cmd(['docker','stop',name])
        final=json.loads(cmd(['docker','inspect',name]))[0]
        assert final['State']['Status']=='exited'
        assert sorted(m.get('Name','') for m in final['Mounts'])==sorted(m.get('Name','') for m in row['Mounts'])
        resources.append({'name':name,'label':row['Config']['Labels'],'before':row['State']['Status'],
            'after':final['State']['Status'],'mounts':mounts,'database':cfg['database']})
after=sorted(cmd(['docker','volume','ls','--format','{{.Name}}']).splitlines())
assert before==after
(PACK/'resource-cleanup.json').write_text(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'resources':resources,'commands':commands,'volumes_before':before,'volumes_after':after,
    'all_volumes_preserved':True,'containers_removed':False},indent=2),encoding='utf8')
print(json.dumps({'task_containers_stopped':len(resources),'all_volumes_preserved':True}))

