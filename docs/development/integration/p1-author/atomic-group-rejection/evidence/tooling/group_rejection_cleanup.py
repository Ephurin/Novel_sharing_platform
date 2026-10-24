import pathlib,json,subprocess,datetime
P=pathlib.Path(__file__).parent;OUT=P/'group-rejection-evidence-pack'
rows=[]
for phase in ['red','final']:
 cfg=json.loads((P/('group-rejection-'+phase)/'resources.json').read_text())
 for name in cfg['containers']:
  inspected=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
  assert inspected['Config']['Labels'].get('astra.task')=='p1-atomic-group-rejection'
  assert name.startswith('astra-group-reject-')
  if name.endswith('-pg'):
   logs=subprocess.run(['docker','logs',name],capture_output=True)
   (OUT/(phase+'-postgres-container.log')).write_bytes(logs.stdout+logs.stderr)
  result=subprocess.run(['docker','stop',name],capture_output=True,text=True)
  assert result.returncode==0,result.stderr
  after=json.loads(subprocess.check_output(['docker','inspect',name],text=True))[0]
  rows.append({'phase':phase,'container':name,'label':inspected['Config']['Labels'],
   'image_id':inspected['Image'],'command':['docker','stop',name],'exit_code':result.returncode,
   'state_after':after['State']['Status'],'mounts_retained':after['Mounts']})
(OUT/'resource-cleanup.json').write_text(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'resources':rows,'containers_removed':False,'volumes_removed':False,'other_task_resources_touched':False},indent=2))
print('Stopped only four verified task-owned containers; retained containers and volumes.')
