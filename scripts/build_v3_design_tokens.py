"""Build independent V3 tokens without overwriting the historical V2 prototype."""
from pathlib import Path
import json,copy
root=Path(__file__).resolve().parents[1]
base=json.loads((root/'design/abasong-independent-v1/tokens.json').read_text())
v3=copy.deepcopy(base)
v3['$description']='Abasong V3 prototype baseline, approved blue direction. Temporary delivery support only.'
for name,value in {'brandPrimary':'#1467D8','brandPressed':'#1054B3','brandSurface':'#EDF4FF','onBrand':'#FFFFFF'}.items():
 v3['color'][name]={'$type':'color','$value':value}
v3['semantic'].update({'actionPrimary':{'$type':'color','$value':'{color.brandPrimary}'},'actionPrimaryPressed':{'$type':'color','$value':'{color.brandPressed}'},'actionPrimaryText':{'$type':'color','$value':'{color.onBrand}'},'actionHighlight':{'$type':'color','$value':'{color.brandSurface}'},'actionHighlightText':{'$type':'color','$value':'{color.brandPrimary}'}})
v3['fontSize']['caption']['$value']['value']=14
v3['fontSize']['code']={'$type':'dimension','$value':{'value':40,'unit':'px'}}
dest=root/'docs/design';(dest/'tokens-v3.json').write_text(json.dumps(v3,ensure_ascii=False,indent=2)+'\n')
def leaves(node,path=()):
 for key,value in node.items():
  if key.startswith('$'):continue
  if '$value' in value:yield path+(key,),value['$value']
  else:yield from leaves(value,path+(key,))
lines=['/* V3 prototype baseline; CSS px map to platform logical units in native components. */',':root {']
for path,value in leaves(v3):
 if isinstance(value,dict):value=f"{value['value']}{value['unit']}"
 elif isinstance(value,str) and value.startswith('{'):value='var(--ab-'+value[1:-1].replace('.','-')+')'
 lines.append('  --ab-'+'-'.join(path)+': '+str(value)+';')
lines.append('}')
(dest/'tokens-v3.css').write_text('\n'.join(lines)+'\n')
print(f'V3 tokens: {len(lines)-3} variables; historical V2 not overwritten')
