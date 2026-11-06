from pathlib import Path
from urllib.parse import urlsplit,unquote
import csv,json,re,subprocess
root=Path(__file__).resolve().parents[3];base='df82aefc32bbcaef6a9671da18ad517e88c4d074';checks=[]
def ok(test,label):
 if not test:raise AssertionError(label)
 checks.append(label)
def cmd(args):return subprocess.check_output(args[:1]+['-c','core.quotepath=false']+args[1:],cwd=root,text=True)
changed=set(cmd(['git','diff',base,'--name-only']).splitlines())|set(cmd(['git','ls-files','--others','--exclude-standard']).splitlines())
allowed=lambda p:p in ['产品基线.md','DEVELOPMENT_STATUS.md','Abasong_PRD_V12_首版产品需求.md'] or p.startswith('docs/') or p.startswith('design/abasong-independent-v1/v12.1-experience/')
ok(all(allowed(p) for p in changed),'all changes limited to approved docs and independent prototype')
ok(not cmd(['git','diff',base,'--','apps','packages','database','scripts','deploy','pnpm-lock.yaml','dependency-lock.md','design/abasong-independent-v1/v12.1-import','design/abasong-independent-v1/tokens-v3.json']).strip(),'native/services/contracts/old prototype/tokens unchanged')
ok(not cmd(['git','diff',base,'--','docs/technical/openapi-v12.yaml']).strip(),'invitation prototype does not change released OpenAPI')
links=0
for name in sorted(changed):
 p=root/name
 if p.suffix not in ['.md','.html'] or 'docs/archive/' in name:continue
 s=p.read_text()
 refs=re.findall(r'\[[^\]]*\]\((<[^>]+>|[^\s)]+)\)',s) if p.suffix=='.md' else re.findall(r'(?:src|href)=[\'"]([^\'"]+)[\'"]',s)
 for ref in refs:
  ref=ref.strip('<>').replace('&amp;','&');url=urlsplit(ref)
  if url.scheme or url.netloc or not url.path or ref.startswith('#'):continue
  q=Path(unquote(url.path));target=q if q.is_absolute() else p.parent/q
  ok(target.exists(),f'link {name}: {ref}')
  links+=1
catalog=json.loads((root/'docs/product/V12.1_页面与状态目录.json').read_text());pages={p['id']:p for p in catalog['pages']}
ok(len(pages)==39 and sum(len(p['states']) for p in pages.values())==387,'39 active nodes/387 required states')
production=list(csv.DictReader((root/'docs/product/V12.1_页面制作清单.csv').open(encoding='utf-8-sig')))
ok(len(production)==39,'39 production rows')
for p in production:ok(int(p['state_count'])==len(pages[p['id']]['states']),f"state count {p['id']}")
for ident in ['C01','C02','C03']:ok(len(pages[ident]['states'])=={'C01':9,'C02':10,'C03':13}[ident],ident+' image state requirements')
state=json.loads((root/'docs/product/V3.2_开发基准状态.json').read_text())
ok(state['development_ready'] is True and not state['b5_ready'] and not state['release_ready'] and not state['app_changed'],'R4 implementation eligible, B5/release/native not claimed')
ok(state['owner_review']['status']=='main_flows_accepted' and not state['owner_review']['all_page_states_accepted'] and not state['owner_review']['native_acceptance'],'owner main-flow review distinct from full acceptance')
ok(state['controlled_implementation']['eligible_batches']==['R4-1'] and state['controlled_implementation']['next_task']=='R4-01' and not state['controlled_implementation']['business_changes_started'],'only R4-1 scoped ready')
ok(state['human_testing']['completed']==0 and state['human_testing']['template_rows']==38,'core human testing remains 0/7 and38rows')
diffs=list(csv.DictReader((root/'docs/technical/V3.2_代码差异清单.csv').open()))
ok([d['id'] for d in diffs]==state['difference_ids']==[f'D{i:02}' for i in range(1,25)],'D01–D24 trace')
ok(state['requirement_ids']==[f'G{i:02}' for i in range(1,25)],'G01–G24 trace')
for d in diffs:
 for ref in d['code_paths'].split(';'):ok((root/ref).is_file(),'actual difference source '+ref)
for name,count in [('V3.2_可用性记录模板.csv',38),('V3.2_司机圈任务记录模板.csv',10),('V3.2_我的团队任务记录模板.csv',7)]:
 rows=list(csv.DictReader((root/'docs/usability'/name).open()))
 ok(len(rows)==count and all(r['outcome']=='not_run' and not r['elapsed_seconds'] for r in rows),f'{name}: {count} unrun observations')
matrix=json.loads((root/'docs/design/experience-upgrade-matrix.json').read_text());up=next(p for p in matrix['items'] if p['id']=='UP14')
ok('UX12' in up['acceptance'] and {'C01','C02','C03'}.issubset(up['pages']),'UP14/UX12 page trace')
copy=(root/'docs/design/Abasong_界面文案与状态规范_V1.md').read_text()
ok(all(c in copy for c in up['copy_ids']),'all circle copy IDs documented')
proto=root/'design/abasong-independent-v1/v12.1-experience'
for name,total in [('browser-checks.json',34),('core-checks.json',10),('circle-checks.json',19),('circle-images-checks.json',17),('account-checks.json',20),('simplification-checks.json',12)]:
 d=json.loads((proto/name).read_text());ok(d['passed']==total and d['failed']==0 and not d['console_errors'] and not d['external_request_hosts'] and not d['native_acceptance'],f'{name}: {total}PASS/0 errors/external; native not claimed')
for p in proto.glob('*.js'):subprocess.run(['./scripts/dev','exec','node','--check',str(p)],cwd=root,check=True,stdout=subprocess.DEVNULL)
ok(len(list(proto.glob('*.js')))==17,'seventeen JS syntax checks')
old=cmd(['git','show',base+':DEVELOPMENT_STATUS.md'])
ok((root/'docs/archive/app-alignment-audit-20261105/工程状态_df82aef快照.md').read_text()==old,'prior current status fully preserved')
for ident,ux in [('UP15','UX13'),('UP16','UX14'),('UP17','UX15'),('UP18','UX16'),('UP19','UX17'),('UP20','UX18'),('UP21','UX19')]:
 u=next(x for x in matrix['items'] if x['id']==ident)
 ok(ux in u['acceptance'] and all(c in copy for c in u['copy_ids']),ident+' copy and UX trace')
spec=(root/'docs/product/Abasong_V12.1_页面功能信息与交互规格.md').read_text()
for p in pages.values():
 ok(f"| {p['id']} | {p['name']} | {p['surface']} | {len(p['states'])} |" in spec,'spec page table '+p['id'])
for ident in ['U01','U02','U03','U10','D02','D01','P01','P03','P08','P09','H01','M02','U15','X02']:
 p=pages[ident];part=spec.split('### '+ident+' · ')[1].split('\n### ')[0]
 ok(all(x in part for x in p['states']),'spec states '+ident)
ok(state['account_follow_up']['completed']==0 and state['account_follow_up']['template_rows']==7 and not state['account_follow_up']['blocks_core_R4_preparation'],'account followup 0/7 does not add core prep blocker')
ok(state['synthetic_checks']['account_tasks']==20 and state['scope']=='source_audit_and_implementation_preparation','prototype scope honest')
ok('U08' not in pages and [p['id'] for p in catalog['retired_pages']]==['U08'],'U08 retired, IDs not renumbered')
ok(next(d for d in diffs if d['id']=='D19')['status']=='cancelled_scope' and state['cancelled_difference_ids']==['D19'],'D19 cancelled, not queued implementation')
ok(not any(a['target']=='U08' for p in pages.values() for a in p['actions']),'no active links to retired U08')
invitation=state['invitation']
ok(not catalog['planned_extensions'] and all(x in pages for x in ['U15','X02']),'invitation IDs now active prototype pages')
ok(invitation['status']=='owner_main_flow_review_recorded_native_distribution_pending' and not invitation['app_changed'] and invitation['prototype_changed'] and not invitation['invite_sent'] and not invitation['distribution_deployed'],'synthetic prototype not native or deployed')
ok(next(d for d in diffs if d['id']=='D21')['status']=='prototype_synthetic_20_pass_actual_implementation_pending','D21 actual code still pending')
ok(next(u for u in matrix['items'] if u['id']=='UP18')['prototype_status']=='synthetic_20_pass_owner_main_flow_review_recorded_native_distribution_pending','UP18 accurate scope')
ok((root/'docs/product'/invitation['requirements']).is_file(),'invitation specification exists')
inv=json.loads((proto/'invitation-checks.json').read_text());reg=json.loads((proto/'invitation-regressions.json').read_text())
for report,total in [(inv,20),(reg,112)]:
 ok(report['passed']==total and report['failed']==0 and not report['console_errors'] and not report['external_request_hosts'] and not report['native_acceptance'] and report['human_participants']==0,'current synthetic report '+str(total))
ok(inv['actual_downloads']==0 and not inv['unexpected_side_effects'],'invitation tests no real distribution/clipboard/share')
ok(invitation['tests_executed']==inv['passed'] and state['synthetic_checks']['invitation_tasks']==20,'invitation report/gate trace')
ok([(x['source'],x['passed']) for x in reg['suites']]==[('checks.browser.js',34),('core-flows.browser.js',10),('account-checks.browser.js',20),('circle-checks.browser.js',19),('circle-images-checks.browser.js',17),('simplification-checks.browser.js',12)],'112 regressions source trace')
new=json.loads((proto/'delivery-checks.json').read_text());current=json.loads((proto/'delivery-regressions.json').read_text())
for report,total in [(new,25),(current,132)]:
 ok(report['passed']==total and report['failed']==0 and not report['console_errors'] and not report['external_request_hosts'] and not report['native_acceptance'] and report['human_participants']==0,'delivery current synthetic report '+str(total))
ok(len(current['suites'])==7 and sum(x['passed'] for x in current['suites'])==132,'seven rerun suites total132')
ok('P04' not in pages and [p['id'] for p in catalog['deferred_pages']]==['P04'] and state['deferred_page_ids']==['P04'],'P04 specialized form deferred, history retained')
ok(not any(a['target']=='P04' for p in pages.values() for a in p['actions']),'no active route to deferred P04')
ok(not state['delivery']['app_changed'] and not state['delivery']['p1_apartment_list_implemented'],'actual App and P1 list unchanged')
ok(next(d for d in diffs if d['id']=='D24')['status']=='P1_documented_not_implemented','P1 list not marked done')
ok(catalog['planned_features'][0]['id']=='G24' and catalog['planned_features'][0]['status']=='documented_not_implemented','P1 planned feature separate from active pages')
tasks=list(csv.DictReader((root/'docs/technical/V3.2_App对齐开发任务清单.csv').open()))
ids={t['task_id'] for t in tasks}
ok(len(tasks)==len(ids)==22,'22 unique work packages, no duplicate D14/D22/D23 counting')
for task in tasks:
 for path in task['code_paths'].split(';'):ok((root/path).is_file(),task['task_id']+' actual source '+path)
 for dep in task['dependencies'].split(';'):
  ok(dep=='none' or dep in ids,task['task_id']+' dependency '+dep)
 ok(all(task[k] for k in ['scope','acceptance','verification','github_issues']),task['task_id']+' executable fields')
visiting=set();visited=set();byid={t['task_id']:t for t in tasks}
def visit(ident):
 ok(ident not in visiting,'acyclic '+ident)
 if ident in visited:return
 visiting.add(ident)
 for dep in byid[ident]['dependencies'].split(';'):
  if dep!='none':visit(dep)
 visiting.remove(ident);visited.add(ident)
for ident in ids:visit(ident)
ok(sum(t['status']=='done_source_audit' for t in tasks)==1 and sum(t['status']=='ready' for t in tasks)==1,'only source audit done and first task ready')
ok(not state['human_testing']['blocks_all_local_R4_implementation'] and state['human_testing']['results_required_for_usability_acceptance'],'human evidence still required, local work independent')
evidence=json.loads((root/'docs/technical/V3.2_App对齐审查证据.json').read_text())
ok(evidence['engineering_check']['tests']==367 and evidence['engineering_check']['result']=='PASS','current engineering check recorded')
ok(not any(evidence[k] for k in ['business_changed','prototype_ui_changed','native_compilation_run','dual_native_visual_run','database_migrations_run','real_mapbox_sms_cloud_run']),'source audit does not claim native/cloud effects')
print(json.dumps({'result':'PASS','validated_assertions':len(checks),'local_links_assets':links,'scoped_files':len(changed),'javascript_syntax_files':17,'pages':39,'state_requirements':387,'difference_rows':24,'delivery_synthetic_tests':25,'existing_synthetic_regressions':132,'p1_apartment_list_implemented':False,'prototype_ui_changed':False,'owner_main_flow_accepted':True,'controlled_R4_ready':True,'implementation_work_packages':22,'unrun_observations':[38,10,7],'human_participants':0,'native_acceptance':False},ensure_ascii=False,indent=2))
