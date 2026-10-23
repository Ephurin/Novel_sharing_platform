import pathlib,json,subprocess,datetime
base=pathlib.Path(__file__).parent;out=base/'p1-identity-final-acceptance';names=[];commands=[]
for file in [base/'p1-identity-final-runtime/red-development-resources.json',base/'p1-identity-final-runtime/resources.json',out/'resources.json']:
 names+=json.loads(file.read_text(encoding='utf8'))['containers']
assert len(set(names))==6
before=json.loads(subprocess.check_output(['docker','inspect',*names],text=True,encoding='utf8'))
assert all(c['Config']['Labels'].get('astra.task')=='p1-identity-final' for c in before)
(out/'all-task-containers-before-stop.json').write_text(json.dumps(before,indent=2),encoding='utf8')
p=subprocess.run(['docker','stop',*names],capture_output=True,text=True,encoding='utf8');commands.append({'command':['docker','stop',*names],'exit_code':p.returncode,'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()});assert p.returncode==0,p.stderr
(out/'container-stop.log').write_text(p.stdout+p.stderr,encoding='utf8')
after=json.loads(subprocess.check_output(['docker','inspect',*names],text=True,encoding='utf8'))
assert all(c['State']['Status']=='exited' for c in after)
assert {c['Id']:c['Mounts'] for c in before}=={c['Id']:c['Mounts'] for c in after}
(out/'retained-containers-volumes.json').write_text(json.dumps({'stopped':True,'volumes_preserved':True,'commands':commands,'containers':[{'name':c['Name'],'id':c['Id'],'status':c['State']['Status'],'mounts':c['Mounts']} for c in after]},indent=2),encoding='utf8')
print('Stopped six exact task-owned containers; all mounts retained')
