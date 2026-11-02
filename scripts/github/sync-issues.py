"""Refresh only our marked task snapshot/labels. Dry-run unless --apply.

Keep every existing task body and human addition outside the managed block.
Never close/reopen issues or change assignees/milestones here.
"""
import json,re,sys
from bootstrap import REPO,STATES,NOTES,SNAPSHOT,gh,api

assert gh(['api','user'])['login']=='olly888'
repo=gh(['repo','view',REPO,'--json','isPrivate'])
assert repo['isPrivate'] or '--allow-public' in sys.argv
issues=api(f'repos/{REPO}/issues?state=all&per_page=100')
changes=[];seen=set()
start='<!-- abasong-current:start -->';end='<!-- abasong-current:end -->'
for issue in issues:
    old=issue.get('body') or ''
    match=re.search(r'<!-- abasong-task:(T\d+) -->',old)
    if not match or 'pull_request' in issue:continue
    tid=match[1];assert tid in STATES and tid not in seen;seen.add(tid)
    assert old.count(start)==old.count(end) and old.count(start)<=1
    block=f'''{start}
## 当前执行状态 · {SNAPSHOT['as_of']}
{STATES[tid]}。以 ADD-20 内测冻结与执行计划和本节为当前基准；下方原始任务说明保留。

{NOTES.get(tid,'按研发总计划的阶段出口验收，契约和原型不代表真实业务已完成。')}
{end}'''
    if start in old:
        updated=re.sub(re.escape(start)+r'.*?'+re.escape(end),lambda _:block,old,flags=re.S)
    else:
        updated=old[:match.end()]+'\n\n'+block+old[match.end():]
    labels=[v['name'] for v in issue['labels'] if not v['name'].startswith('status:')]+['status:'+STATES[tid]]
    if updated!=old or set(labels)!={v['name'] for v in issue['labels']}:
        changes.append((issue['number'],updated,labels))
assert len(seen)==35
if '--apply' not in sys.argv:
    print(json.dumps({'dry_run':True,'managed_tasks':len(seen),'updates':len(changes)}));raise SystemExit
for number,body,labels in changes:
    api(f'repos/{REPO}/issues/{number}','PATCH',{'body':body,'labels':labels})
print(json.dumps({'updated':len(changes),'preserved_original_bodies':True}))
