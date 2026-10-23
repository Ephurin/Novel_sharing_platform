"""Aggregate real results without upgrading failed or inherited evidence."""
from pathlib import Path
import hashlib,json,re,subprocess
B=Path(__file__).resolve().parent;ROOT=B.parents[2]
FINAL='a2ec488035728e4135d65e664838044f0ec41646';BASE='3cf18c93b74d62f1f2a3b13f8f034d9d107c6049';PR='7b15c078c1ffe2fca96c4e66c96577e3ff007c3c'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(name,v):(B/name).write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n',encoding='utf-8',newline='\n')
def cmd(args):return subprocess.check_output(args,cwd=ROOT,text=True,encoding='utf-8').strip()
assert cmd(['git','rev-parse','HEAD'])==FINAL
assert cmd(['git','diff','--name-only',BASE,'HEAD'])=='Pipeline_test/tools/fe_core_contract_probe.py\nPipeline_test/tools/prepare_fe_core_contract.py'
trees={name:{'base':cmd(['git','rev-parse',BASE+':'+name]),'tested':cmd(['git','rev-parse',FINAL+':'+name])} for name in ['backend','ai-service','web']}
assert all(v['base']==v['tested'] for v in trees.values())
v=read(B/'core-runtime-03/validation.json');assert v['tested_sha']==FINAL and not v['source_dirty_at_start'] and v['failure'] is None
passed=[r for r in v['rows'] if r['status']=='PASS'];failed=[r for r in v['rows'] if r['status']=='FAIL'];assert len(passed)==10 and len(failed)==3
commands=read(B/'commands-and-exits-03.json');probe=next(r for r in commands if 'Pipeline_test/tools/fe_core_contract_probe.py' in r['command']);assert probe['exit_code']==1
rows=[]
for r in v['rows']:
 rows.append({**r,'tested_sha':FINAL,'production_tree_unchanged_from':BASE,'production_and_test_paths_clean':True,'whole_worktree_clean_at_start':False,'worktree_note':'Only new evidence directory untracked; scoped production/test paths clean','command':probe['command'],'driver_exit_code':1,'execution':'NEW_INDEPENDENT_EXECUTOR_RUNTIME','provider':'FAKE_HTTP_ONLY','PG_evidence':'core-runtime-03-audit/PostgreSQL.json','Mongo_evidence':'core-runtime-03-audit/MongoDB.json','timeline':'core-runtime-03/http-trace.jsonl','scope_note':'API consumer model, not mounted hook/editor/browser' if r['test'].startswith(('04','08','09')) else None})
old=ROOT/'Pipeline_test/reviews/2026-10-22-p123-headless/fe-integration-preflight-2026-10-22'
inherited=[{'test':'PR55_missing_version_428_valid_save_stale_409','status':'PASS','tested_sha':PR,'tree_cleanliness':'Inherited source_clean=true, not independently rechecked by a checkout in this spike','command':read(old/'pr55-api-command.json')['command'],'driver_exit_code':0,'proof':'INHERITED_SEPARATE_PR55_HTTP_PERSISTENCE','execution':'INHERITED_NOT_RERUN','evidence':str((old/'pr55-api-contract/validation.json').relative_to(ROOT)).replace('\\','/')},
 {'test':'PR55_mounted_hook_Undo_inflight_switch_recovery_409','status':'PASS','tested_sha':PR,'tree_cleanliness':'Inherited clean_before/after=true','command':['node','--test','tests/draft-persistence.browser.test.mjs'],'driver_exit_code':0,'proof':'INHERITED_MOUNTED_HOOK_BROWSER_NOT_FULL_EDITOR','execution':'INHERITED_NOT_RERUN','evidence':str((old/'browser-runtime.json').relative_to(ROOT)).replace('\\','/')}]
notrun=[{'test':name,'status':'BLOCKED' if name.startswith('S09') else 'NOT_RUN','tested_sha':None,'tree_cleanliness':'NOT_APPLICABLE_UNEXECUTED','command':None,'driver_exit_code':None,'proof':'NONE','execution':'NOT_EXECUTED','blocker':reason} for name,reason in [
 ('PR55_same_payload_and_active_Core_composite_runtime','No composite backend or FE integration authorized; source differs in replay and automatic snapshot'),
 ('S09_full_AuthorWritingIde_all_required_scenarios','Requires FE-owned editor/auth/router/cache changes and D1/D2 approval; existing hook fixture is insufficient'),
 ('S09_active_baseline_queued_B_via_returned_version_browser','Core response version mismatch is proven; effect on actual editor is inferred, not browser-executed'),
 ('S10_S11','Separately gated after independently accepted S09'),('Populated_database_upgrade','No approved combined migration or populated target'),('REAL_PROVIDER','Explicitly prohibited')]]
lifecycle=[];secrets=[]
for suffix in ['', '-02','-03']:
 m=read(B/('environment'+suffix+'.json'));project=m['project'];assert m['explicit_mutation_opt_in'] and m['new_resources_only']
 containers=[json.loads(line) for line in cmd(['docker','ps','-a','--filter','label=com.docker.compose.project='+project,'--format','{{json .}}']).splitlines()]
 assert containers and all(c['State']!='running' for c in containers)
 volumes=cmd(['docker','volume','ls','--filter','label=com.docker.compose.project='+project,'--format','{{.Name}}']).splitlines();assert len(volumes)==4
 lifecycle.append({'project':project,'all_stopped':True,'containers':[{'name':c['Names'],'state':c['State']} for c in containers],'retained_volumes':volumes})
 for line in (ROOT/m['env_file']).read_text(encoding='utf-8').splitlines():
  if '=' not in line:continue
  k,value=line.split('=',1)
  if any(s in k for s in ['PASSWORD','TOKEN','SECRET','API_KEY']) and len(value)>=12:secrets.append(value)
write('resource-lifecycle.json',lifecycle)
audit=read(B/'core-runtime-03-audit/migrations.json');assert len(audit['backend'])==12 and audit['AI']=='0013_objective_intent'
assert len(read(B/'core-runtime-03-audit/context-hashes.json'))==2
write('validation.json',{'verdict':'BLOCKED_RUNTIME_OR_SOURCE_INCOMPATIBILITY','tested_sha':FINAL,'production_base_sha':BASE,'new_runtime_passed':10,'new_runtime_failed':3,'expected_probe_exit_code':1,'new_runtime_rows':rows,'inherited_rows':inherited,'unexecuted_rows':notrun,'D1_D2_owner_approval':'NOT_RECORDED','full_S09':'BLOCKED_NOT_RUN','Issue56':'OPEN_NOT_CLOSED','production_modified':False,'FE_modified':False,'combined_schema_required':False,'actual_new_DB_migrations':'Core 12 SQL + separate AI Alembic 0013; 18-SQL union remains inherited empty-DB rehearsal only','new_resources':3,'retained_volumes':12,'real_provider_calls':0,'real_paid_spend':0,'external_integration_merge':'NOT_PERFORMED','independent_GPT6_review':'PENDING'})
write('SOURCE_DIFF_AND_PROVENANCE.json',{'initial_local_head':'f296f8b','verified_remote_checkpoint':BASE,'synchronization':'clean worktree fast-forward only; no reset/clean/stash/FE merge','test_source_commits':['b39e47f0c3d7044f5358cfb4896aafc35d2f67c3','4c6e25a8beb64b56999a62ef61599508ce1c836b',FINAL],'production_trees':trees,'changed_paths':cmd(['git','diff','--name-only',BASE,'HEAD']).splitlines(),'worktrees':'One existing pipeline worktree reused; no FE checkout/composite created','PR54':'18759ae65f33f935c7243b53f435630a7c53f4cb','PR55':PR,'PR_metadata':'github-pr54.json and github-pr55.json fetched read-only','source_snapshots':'pr55-pinned-sources.json contains exact GitHub blob IDs/content','runtime_01':'Idea baseline active/null anchor, D2 fixture predicate not satisfied; retained, no production repair','runtime_02':'Anchored checkpoint proves canonical path; actual trace motivates new two version assertions','runtime_03':'Final 13-row probe; 10 PASS/3 FAIL; process exit 1 retained'})
text=['# Compatibility test matrix','',f'Tested source `{FINAL}`; backend/AI/web trees identical to `{BASE}`. Final driver exit **1**, deliberately preserving three genuine failures. All new rows are fresh isolated persistence/API execution, not browser or real-provider proof. Source/test paths were clean; the new evidence directory was untracked.','', '| Test | Result | Command / exit | Proof and durable evidence |','|---|---|---|---|']
for r in rows:text.append(f"| {r['test']} | {r['status']} | commands-and-exits-03.json probe; exit 1 (shared process) | New real HTTP/PG/Mongo; core-runtime-03/http-trace.jsonl, D1/D2 readbacks, core-runtime-03-audit/. {'FAKE HTTP provider for canonical path.' if r['test'].startswith('10') else 'No browser claim.'} |")
text+=['','The shared nonzero process exit does not convert successful row assertions into failures or failed rows into PASS. Per-row SHA, cleanliness, exact argv, process exit, proof type and inherited/new attribution are explicit in validation.json. The authoritative version counterexamples are active-save-response-versus-durable-draft.json (response 9, Mongo 10) and active-retry-readback.json (before 10, response 10, after 11).','','| Additional proof/gate | Status | Provenance / limit |','|---|---|---|']
for r in inherited:text.append(f"| {r['test']} | PASS inherited | `{PR}`; original command exit 0; {r['evidence']}; NOT independently rerun |")
for r in notrun:text.append(f"| {r['test']} | {r['status']} | No executed command/exit or tested SHA; {r['blocker']} |")
text+=['','S09 checklist remains unexecuted in the full editor: saved B→temporary A→Undo B, in-flight A→B, rapid chapter/account switch, navigation/recovery, concurrent-tab 409, active canonical checkpoint provenance and no cross-user/chapter writes. API analogues and the inherited mounted-hook fixture do not close those editor requirements.','', 'Ordered lease/crash semantics and broader P123 acceptance are inherited from prior reviewed evidence and inspected unchanged source; not independently stress/crash-tested again. Three new resources are stopped with twelve volumes retained. No combined schema or populated upgrade, publishing, wallet/payment, full P123 suites or 100k run.']
(B/'COMPATIBILITY_TEST_MATRIX.md').write_text('\n'.join(text)+'\n',encoding='utf-8',newline='\n')
files=[p for p in B.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name!='integrity-sha256.json']
for p in files:
 s=p.read_text(encoding='utf-8-sig').replace('\r\n','\n');s='\n'.join(line.rstrip() for line in s.splitlines()).rstrip()+'\n'
 assert not any(secret in s for secret in secrets),'Credential detected in '+str(p)
 assert not re.search(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',s),'JWT detected in '+str(p)
 p.write_text(s,encoding='utf-8',newline='\n')
write('integrity-sha256.json',{'algorithm':'SHA256','secret_scan':'PASS','files':{str(p.relative_to(B)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}})
print(json.dumps({'verdict':'BLOCKED_RUNTIME_OR_SOURCE_INCOMPATIBILITY','passed':10,'failed':3,'projects_stopped':3,'volumes_retained':12,'files_sealed':len(files)}))
