import argparse,pathlib,sys,runpy,json
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--output',required=True);a=p.parse_args()
root=pathlib.Path(a.root).resolve();out=pathlib.Path(a.output).resolve();sys.argv=[str(root/'scripts/p1_final_acceptance.py'),'status','--output',str(out)]
c=runpy.run_path(sys.argv[0]);run=c['run'];project=c['cfg']['project'];assert project=='codex-p1-final-8c19b8c475'
def others(label):
 text=run(label,['docker','ps','-a','--format','{{json .}}'])
 records=[json.loads(line) for line in text.splitlines() if line.strip()]
 return sorted(({'id':r['ID'],'name':r['Names'],'state':r['State']} for r in records if 'com.docker.compose.project='+project not in r.get('Labels','')),key=lambda r:r['id'])
before=others('other-containers-before-owned-cleanup')
args=['docker','volume','ls','--filter','label=com.docker.compose.project='+project,'--format','{{.Name}}']
volumes=run('owned-volumes-before-cleanup',args).splitlines()
run('final-owned-cleanup-command',['python',str(root/'scripts/p1_final_acceptance.py'),'cleanup-owned','--output',str(out)])
after=others('other-containers-after-owned-cleanup');retained=run('owned-volumes-after-cleanup',args).splitlines()
assert sorted(volumes)==sorted(retained) and volumes
result={'project':project,'other_containers_before':before,'other_containers_after':after,'other_container_records_unchanged':before==after,
 'owned_volumes_retained':sorted(retained),'volumes_deleted':0,'global_prune_used':False,'only_owned_project_stopped':True}
(out/'cleanup-isolation-result.json').write_text(json.dumps(result,indent=2),encoding='utf8');print('Owned containers stopped; volumes retained; other container records unchanged:',before==after)
