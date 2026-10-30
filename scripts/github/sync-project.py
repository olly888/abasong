"""Initial-only board status sync; not a background automation or recurring authority."""
import sys,json,re
from pathlib import Path
from bootstrap import ROOT,REPO,gh,STATES,stage
if '--initial-sync' not in sys.argv:raise SystemExit('Use --initial-sync only during explicitly authorized initial setup')
assert gh(['api','user'])['login']=='olly888'
repo=gh(['repo','view',REPO,'--json','isPrivate']);assert repo['isPrivate'] or '--allow-public' in sys.argv
project=gh(['project','view','1','--owner','olly888','--format','json']);assert project['title']=='Abasong V12.1 开发与验收' and not project['public']
fields=gh(['project','field-list','1','--owner','olly888','--format','json'])['fields']
if not any(x['name']=='阶段' for x in fields):
 gh(['project','field-create','1','--owner','olly888','--name','阶段','--data-type','SINGLE_SELECT','--single-select-options','D0,D1,D2,D3,D4','--format','json'])
fields=gh(['project','field-list','1','--owner','olly888','--format','json'])['fields']
status=next(f for f in fields if f['name']=='Status');phase=next(f for f in fields if f['name']=='阶段')
status_options={o['name']:o['id'] for o in status['options']};phase_options={o['name']:o['id'] for o in phase['options']}
assert set(status_options)=={'待开发','开发中','待验收','已完成'}
def field_values():
 query="query($id:ID!){node(id:$id){... on ProjectV2{items(first:100){nodes{id fieldValues(first:30){nodes{... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{id name}}}}}}}}}}"
 data=gh(['api','graphql'],{'query':query,'variables':{'id':project['id']}})['data']['node']['items']['nodes']
 return {item['id']:{v['field']['id']:v['name'] for v in item['fieldValues']['nodes'] if v.get('field')} for item in data}
current_values=field_values()
items=gh(['project','item-list','1','--owner','olly888','--format','json','--limit','100'])['items'];assert len(items)==35
changes=[]
for item in items:
 content=item['content'];assert content['repository']==REPO
 match=re.search(r'<!-- abasong-task:(T\d+) -->',content['body']);assert match;tid=match[1]
 if item.get('status')!=STATES.get(tid,'待开发'):changes.append((item['id'],status['id'],status_options[STATES.get(tid,'待开发')]))
 if current_values.get(item['id'],{}).get(phase['id'])!=stage(tid):changes.append((item['id'],phase['id'],phase_options[stage(tid)]))
for start in range(0,len(changes),15):
 group=changes[start:start+15];definitions=['$project:ID!'];variables={'project':project['id']};parts=[]
 for i,(item,field,option) in enumerate(group):
  definitions += [f'$i{i}:ID!',f'$f{i}:ID!',f'$o{i}:String!'];variables.update({f'i{i}':item,f'f{i}':field,f'o{i}':option})
  parts.append('u'+str(i)+':updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$i'+str(i)+',fieldId:$f'+str(i)+',value:{singleSelectOptionId:$o'+str(i)+'}}){projectV2Item{id}}')
 query='mutation('+','.join(definitions)+'){'+ ' '.join(parts)+'}'
 gh(['api','graphql'],{'query':query,'variables':variables})
actual=gh(['project','item-list','1','--owner','olly888','--format','json','--limit','100'])['items'];counts={s:0 for s in status_options}
verified_values=field_values()
for item in actual:
 tid=re.search(r'<!-- abasong-task:(T\d+) -->',item['content']['body'])[1]
 assert item.get('status')==STATES.get(tid,'待开发') and verified_values.get(item['id'],{}).get(phase['id'])==stage(tid)
 counts[item['status']]+=1
result={'project_url':project['url'],'private':not project['public'],'items':len(actual),'statuses':counts}
(ROOT/'.tooling/github/project-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
