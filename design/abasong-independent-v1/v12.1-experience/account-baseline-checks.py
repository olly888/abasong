from pathlib import Path
from urllib.parse import urlsplit,unquote
import csv,json,re,subprocess
root=Path(__file__).resolve().parents[3];base='8841d6bc41380e44d0f181a446ee79aab0e9d611';checks=[]
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
ok(len(pages)==40 and sum(len(p['states']) for p in pages.values())==374,'40 active nodes/374 required states')
production=list(csv.DictReader((root/'docs/product/V12.1_页面制作清单.csv').open(encoding='utf-8-sig')))
ok(len(production)==40,'40 production rows')
for p in production:ok(int(p['state_count'])==len(pages[p['id']]['states']),f"state count {p['id']}")
for ident in ['C01','C02','C03']:ok(len(pages[ident]['states'])=={'C01':9,'C02':10,'C03':13}[ident],ident+' image state requirements')
state=json.loads((root/'docs/product/V3.2_开发基准状态.json').read_text())
ok(state['development_ready'] is False and state['b5_ready'] is False and state['app_changed'] is False,'unpassed gates honest')
ok(state['human_testing']['completed']==0 and state['human_testing']['template_rows']==38,'core human testing remains 0/7 and38rows')
diffs=list(csv.DictReader((root/'docs/technical/V3.2_代码差异清单.csv').open()))
ok([d['id'] for d in diffs]==state['difference_ids']==[f'D{i:02}' for i in range(1,22)],'D01–D21 trace')
ok(state['requirement_ids']==[f'G{i:02}' for i in range(1,22)],'G01–G21 trace')
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
ok(len(list(proto.glob('*.js')))==15,'fifteen JS syntax checks')
old=cmd(['git','show',base+':DEVELOPMENT_STATUS.md'])
ok((root/'docs/archive/invitation-prototype-20261105/工程状态_8841d6b快照.md').read_text()==old,'prior current status fully preserved')
for ident,ux in [('UP15','UX13'),('UP16','UX14'),('UP17','UX15'),('UP18','UX16')]:
 u=next(x for x in matrix['items'] if x['id']==ident)
 ok(ux in u['acceptance'] and all(c in copy for c in u['copy_ids']),ident+' copy and UX trace')
spec=(root/'docs/product/Abasong_V12.1_页面功能信息与交互规格.md').read_text()
for p in pages.values():
 ok(f"| {p['id']} | {p['name']} | {p['surface']} | {len(p['states'])} |" in spec,'spec page table '+p['id'])
for ident in ['U01','U02','U03','U10','D02','D01','P03','M02','U15','X02']:
 p=pages[ident];part=spec.split('### '+ident+' · ')[1].split('\n### ')[0]
 ok(all(x in part for x in p['states']),'spec states '+ident)
ok(state['account_follow_up']['completed']==0 and state['account_follow_up']['template_rows']==7 and not state['account_follow_up']['blocks_core_R4_preparation'],'account followup 0/7 does not add core prep blocker')
ok(state['synthetic_checks']['account_tasks']==20 and state['scope']=='documents_and_independent_prototype_only','prototype scope honest')
ok('U08' not in pages and [p['id'] for p in catalog['retired_pages']]==['U08'],'U08 retired, IDs not renumbered')
ok(next(d for d in diffs if d['id']=='D19')['status']=='cancelled_scope' and state['cancelled_difference_ids']==['D19'],'D19 cancelled, not queued implementation')
ok(not any(a['target']=='U08' for p in pages.values() for a in p['actions']),'no active links to retired U08')
invitation=state['invitation']
ok(not catalog['planned_extensions'] and all(x in pages for x in ['U15','X02']),'invitation IDs now active prototype pages')
ok(invitation['status']=='synthetic_prototype_pending_user_confirmation' and not invitation['app_changed'] and invitation['prototype_changed'] and not invitation['invite_sent'] and not invitation['distribution_deployed'],'synthetic prototype not native or deployed')
ok(next(d for d in diffs if d['id']=='D21')['status']=='prototype_synthetic_20_pass_actual_implementation_pending','D21 actual code still pending')
ok(next(u for u in matrix['items'] if u['id']=='UP18')['prototype_status']=='synthetic_20_pass_pending_user_confirmation_native_distribution_pending','UP18 accurate scope')
ok((root/'docs/product'/invitation['requirements']).is_file(),'invitation specification exists')
inv=json.loads((proto/'invitation-checks.json').read_text());reg=json.loads((proto/'invitation-regressions.json').read_text())
for report,total in [(inv,20),(reg,112)]:
 ok(report['passed']==total and report['failed']==0 and not report['console_errors'] and not report['external_request_hosts'] and not report['native_acceptance'] and report['human_participants']==0,'current synthetic report '+str(total))
ok(inv['actual_downloads']==0 and not inv['unexpected_side_effects'],'invitation tests no real distribution/clipboard/share')
ok(invitation['tests_executed']==inv['passed'] and state['synthetic_checks']['invitation_tasks']==20,'invitation report/gate trace')
ok([(x['source'],x['passed']) for x in reg['suites']]==[('checks.browser.js',34),('core-flows.browser.js',10),('account-checks.browser.js',20),('circle-checks.browser.js',19),('circle-images-checks.browser.js',17),('simplification-checks.browser.js',12)],'112 regressions source trace')
print(json.dumps({'result':'PASS','validated_assertions':len(checks),'local_links_assets':links,'scoped_files':len(changed),'javascript_syntax_files':15,'pages':40,'state_requirements':374,'difference_rows':21,'invitation_synthetic_tests':20,'existing_synthetic_regressions':112,'prototype_ui_changed':True,'unrun_observations':[38,10,7],'human_participants':0,'native_acceptance':False},ensure_ascii=False,indent=2))
