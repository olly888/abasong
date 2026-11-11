"""Idempotent project bootstrap. Explicit manual command; never a CI auto-publish step.
Requires an audited/pushed olly888/abasong (public needs explicit --allow-public) and authenticated gh with project scope.
No credentials or project business data are read.
"""
from pathlib import Path
import json,re,subprocess
ROOT=Path(__file__).resolve().parents[2]
REPO='olly888/abasong'
def gh(args,body=None):
 command=['gh',*args]
 if body is not None:
  command+=['--input','-']
 p=subprocess.run(command,input=json.dumps(body) if body is not None else None,text=True,capture_output=True,cwd=ROOT)
 if p.returncode:raise RuntimeError('GitHub command failed; inspect authenticated CLI and API access (no credentials emitted)')
 return json.loads(p.stdout) if p.stdout.strip() else None
def api(path,method='GET',body=None):return gh(['api','--method',method,path],body)
def rows():
 text=(ROOT/'docs/technical/V12_开发顺序与验证计划.md').read_text()
 tasks=[]
 for line in text.splitlines():
  if re.match(r'^\| T\d+ \|',line):
   rid,title,depends,accept=[v.strip() for v in line.strip('|').split('|')]
   tasks.append(dict(id=rid,title=title,dependencies=depends,acceptance=accept))
 assert len(tasks)==35 and len({t['id'] for t in tasks})==35
 return tasks
SNAPSHOT=json.loads((ROOT/'scripts/github/task-status.json').read_text())
STATES=SNAPSHOT['states']
assert set(STATES)=={f'T{i:02d}' for i in range(1,36)}
assert set(STATES.values())<=set(['待开发','开发中','待验收','已完成'])
def stage(rid):
 n=int(rid[1:])
 if n in (1,3):return 'D0'
 if n in (2,4,5,6,7,8,9,10,11) or n>=25:return 'D1'
 if 12<=n<=16:return 'D2'
 if 17<=n<=20:return 'D3'
 return 'D4'
NOTES=SNAPSHOT['notes']
def body(t):
 s=STATES.get(t['id'],'待开发')
 content=f'''<!-- abasong-task:{t['id']} -->
## 目标
{t['title']}

阶段：{stage(t['id'])}；当前状态：{s}；快照：{SNAPSHOT['as_of']}。前置：{t['dependencies']}。

## 验收标准
- [ ] {t['acceptance']}
- [ ] 记录实际命令、环境、代码版本及未测项；有意义的相关测试通过。
- [ ] 同步源契约/生成类型、增量迁移和产品/工程文档（适用时）。

## 已有事实与限制
{NOTES.get(t['id'],'当前状态基于ADD-20研发总计划；未实现的设计契约/原型不作为完成证据。' if s!='已完成' else '本地工程范围已有实际验证证据；不代表生产部署完成。')}

## 依据
- [研发总计划](https://github.com/olly888/abasong/blob/main/docs/Abasong_V12.1_项目开发与验收总计划.md)
- [任务与详细用例](https://github.com/olly888/abasong/blob/main/docs/technical/V12_开发顺序与验证计划.md)
- [当前工程状态](https://github.com/olly888/abasong/blob/main/DEVELOPMENT_STATUS.md)

范围：临时配送支援，一端三导航，不做长期招聘或平台结算。禁止在Issue/日志中填写真实门码、凭据、OTP、消息正文或精确位置。
'''
 if s=='已完成':content=content.replace('- [ ]','- [x]')+'\n证据：[D0工程验证](https://github.com/olly888/abasong/blob/main/docs/technical/D0_工程验证记录.md)，仅表示本地工程范围通过。\n'
 return content
def prepare():
 tasks=rows();target=ROOT/'.tooling/github/tasks.json';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps([{**t,'stage':stage(t['id']),'status':STATES.get(t['id'],'待开发'),'body':body(t)} for t in tasks],ensure_ascii=False,indent=2)+'\n');return tasks
if __name__=='__main__':
 import sys
 tasks=prepare()
 if '--prepare-only' in sys.argv:print('Prepared35 tasks; no remote writes');raise SystemExit
 if not (ROOT/'.tooling/security/publish-approved.json').exists():raise RuntimeError('Run and review complete history audit before remote bootstrap')
 login=gh(['api','user'])['login'];assert login=='olly888'
 repo=gh(['repo','view',REPO,'--json','nameWithOwner,isPrivate,id']);assert repo['nameWithOwner']==REPO
 if not repo['isPrivate']:assert '--allow-public' in sys.argv, 'Public repository requires explicit --allow-public'
 labels={x['name'] for x in api(f'repos/{REPO}/labels?per_page=100')}
 definitions={'type:task':('1D76DB','总计划开发任务'),'priority:P0':('B60205','首版关键任务')}
 for d in range(5):definitions[f'stage:D{d}']=('5319E7',f'D{d}阶段')
 for s in ['待开发','开发中','待验收','已完成']:definitions[f'status:{s}']=('0E8A16' if s=='已完成' else 'FBCA04',s)
 for name,(color,description) in definitions.items():
  if name not in labels:api(f'repos/{REPO}/labels','POST',{'name':name,'color':color,'description':description})
 milestones={x['title'].split(' ')[0]:x for x in api(f'repos/{REPO}/milestones?state=all&per_page=100')}
 names=['工程基础','公寓价值闭环','临时支援闭环','首版补齐','受控试点与发布']
 for i,name in enumerate(names):
  key=f'D{i}'
  if key not in milestones:milestones[key]=api(f'repos/{REPO}/milestones','POST',{'title':f'{key} {name}','description':'以项目开发与验收总计划的阶段出口为准，不按代码量判断完成；未指定无依据截止日期。'})
 issues={}
 for issue in api(f'repos/{REPO}/issues?state=all&per_page=100'):
  marker=re.search(r'<!-- abasong-task:(T\d+) -->',issue.get('body') or '')
  if marker:issues[marker[1]]=issue
 for t in tasks:
  if t['id'] not in issues:
   s=STATES.get(t['id'],'待开发');issue=api(f'repos/{REPO}/issues','POST',{'title':f"[{t['id']}] {t['title']}",'body':body(t),'labels':['type:task','priority:P0',f"stage:{stage(t['id'])}",f'status:{s}'],'milestone':milestones[stage(t['id'])]['number']});issues[t['id']]=issue
   if s=='已完成':api(f"repos/{REPO}/issues/{issue['number']}",'PATCH',{'state':'closed','state_reason':'completed'})
 for t in tasks:
  issue=issues[t['id']];s=STATES.get(t['id'],'待开发');wanted=['type:task','priority:P0',f"stage:{stage(t['id'])}",f'status:{s}']
  if not set(wanted).issubset({x['name'] for x in issue.get('labels',[])}):
   api(f"repos/{REPO}/issues/{issue['number']}",'PATCH',{'labels':list(dict.fromkeys([x['name'] for x in issue.get('labels',[])]+wanted))})
 if milestones['D0']['state']!='closed':api(f"repos/{REPO}/milestones/{milestones['D0']['number']}",'PATCH',{'state':'closed'})
 output={'repository':repo['nameWithOwner'],'milestones':{k:v['number'] for k,v in milestones.items()},'issues':{k:{'number':v['number'],'url':v['html_url'],'node_id':v['node_id'],'status':STATES.get(k,'待开发')} for k,v in issues.items()}}
 (ROOT/'.tooling/github/bootstrap-result.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'repository':REPO,'milestones':len(milestones),'tasks':len(issues)},ensure_ascii=False))
