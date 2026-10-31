"""Static contract checks only. Does not connect to a DB or third-party project.
Requires PyYAML, pglast, openapi-spec-validator in the caller's Python environment.
"""
from pathlib import Path
import json,re
import yaml
from pglast import parse_sql, ast
from openapi_spec_validator import validate_spec
from openapi_schema_validator import OAS30Validator
import warnings
with warnings.catch_warnings():
    warnings.simplefilter('ignore',DeprecationWarning)
    from jsonschema import RefResolver
ROOT=Path(__file__).resolve().parents[1]
contract=yaml.safe_load((ROOT/'docs/technical/openapi-v12.yaml').read_text())
validate_spec(contract)
operations=[(path,method,op) for path,item in contract['paths'].items() for method,op in item.items()]
ids=[op['operationId'] for _,_,op in operations]
assert len(ids)==len(set(ids)), 'Duplicate operationId'
for path,method,op in operations:
    assert path.startswith('/v1/') or path=='/health/live'
    assert '401' in op['responses'] and '403' in op['responses'] and '404' in op['responses']
    if path.startswith('/v1/ops/'):
        assert op.get('x-internal') and op.get('x-requires-staff-mfa') and op.get('x-required-capabilities')
    if op.get('x-sensitive-response'):
        for status,response in op['responses'].items():
            if status.startswith('2'):assert 'Cache-Control' in response['headers']
    if method in ('post','put','patch') and 'requestBody' in op:
        name=op['requestBody']['content']['application/json']['schema']['$ref'].split('/')[-1]
        assert contract['components']['schemas'][name]['additionalProperties'] is False
for forbidden in ('/payments','/wallet','/settlement','/pod','/handoff/confirm','/dispatch'):
    assert not any(forbidden in path for path in contract['paths'])
for n in ('AccessRecord','Apartment','Request','Profile','Message','Driver'):
    props=contract['components']['schemas'][n]['properties']
    assert not {'ciphertext','dedup_hmac','encrypted_dek','push_token','phone'}.intersection(props)
assert contract['components']['schemas']['ProfilePatch']['properties']['experience']['items']['$ref'].endswith('/ExperienceInput')
assert 'source' not in contract['components']['schemas']['ExperienceInput']['properties']
assert 'client_event_id' in contract['components']['schemas']['FeedbackInput']['required']
assert contract['info']['version']=='12.1.0'
for name in ('RequestDraftInput','RequestPatch','Request','RequestVersion','PublicRequestSummary'):
    assert not {'engagement_type','training_available','trial_policy','trial_terms','cooperation_schedule','start_arrangement'}.intersection(contract['components']['schemas'][name]['properties'])
assert 'expected_arrival_at' in contract['components']['schemas']['ApplyInput']['required']
assert not contract['components']['schemas']['ApplyInput']['properties']['expected_arrival_at'].get('nullable',False)
public_ops=[operation for path,method,operation in operations if operation.get('security')==[]]
assert {op['operationId'] for op in public_ops}=={'healthLive','getPublicRequestShare'}
public_fields=contract['components']['schemas']['PublicRequestSummary']['properties']
assert not {'publisher_id','user_id','phone','description','private_payment_terms','value','trial_terms','meeting_details'}.intersection(public_fields)
resolver=RefResolver.from_schema(contract)
OAS30Validator(contract['components']['schemas']['PublicRequestShare'],resolver=resolver).validate({'status':'ended','title':'该支援需求已结束','summary':None})
OAS30Validator(contract['components']['schemas']['Driver'],resolver=resolver).validate({'profile':{'user_id':'00000000-0000-4000-8000-000000000001','display_name':'合成司机','bio':None,'vehicle_type':None,'experience':[]},'availability':None,'regions':[]})
sql=(ROOT/'database/migrations/0001_v12_initial.sql').read_text()
parsed=parse_sql(sql)
tables=[stmt.stmt.relation.relname for stmt in parsed if isinstance(stmt.stmt,ast.CreateStmt)]
assert len(tables)==len(set(tables))
assert {'access_secrets','message_secrets','request_private_details','feedback_events','outbox','capabilities','experience_verifications'}.issubset(tables)
assert not any(re.search(r'payment|wallet|settlement|position_history|location_history|trajectory',name) for name in tables)
assert 'REVOKE ALL ON SCHEMA abasong FROM PUBLIC' in sql
assert 'FORCE ROW LEVEL SECURITY' in sql and 'NOBYPASSRLS' in sql
assert "('access_secrets','message_secrets','request_private_details')" in sql
assert 'request_shares' in tables and 'minimum_parcels' in sql and 'pickup_region_id' in sql
assert not re.search(r'\b(engagement_type|ongoing|training_available|trial_policy|cooperation_schedule|availability_note)\b',sql)
incremental_sql=(ROOT/'database/migrations/0002_personal_apartments.sql').read_text()
incremental_parsed=parse_sql(incremental_sql)
incremental_tables=[stmt.stmt.relation.relname for stmt in incremental_parsed if isinstance(stmt.stmt,ast.CreateStmt)]
assert set(incremental_tables)=={'personal_apartments','personal_access_records'}
assert 'FOREIGN KEY(owner_id,entry_id)' in incremental_sql
assert 'FROM PUBLIC,abasong_api,abasong_worker' in incremental_sql
assert "current_setting('abasong.actor_id',true)" in incremental_sql
for name in ('LibraryCreate','LibraryPatch','PrivateRecordCreate','PrivateRecordPatch','PrivateShareInput'):
 assert not {'owner_id','status','capabilities','payload'}.intersection(contract['components']['schemas'][name]['properties'])
catalog=json.loads((ROOT/'docs/product/V12.1_页面与状态目录.json').read_text())
page_ids={p['id'] for p in catalog['pages']}
assert len(page_ids)==len(catalog['pages'])==40
assert {'B04','B05','B06','U09'}.issubset(page_ids)
for page in catalog['pages']:
    if page['id'] in {'B04','B05','B06'}:
        assert page['api_operations'] and page.get('api_contract_status'),page['id']
for page in catalog['pages']:
    assert page['information'] and page['states'] and page['acceptance']
    assert all(a['target'] in page_ids for a in page['actions']),page['id']
    assert set(page['api_operations']).issubset(set(ids)),(page['id'],page['api_operations'])
    assert not any(word in ' '.join(page['information']+page['states']) for word in ['长期','试线','带教','入职']),page['id']
batch_sql=(ROOT/'database/migrations/0004_import_batches.sql').read_text()
batch_parsed=parse_sql(batch_sql)
assert 'FORCE ROW LEVEL SECURITY' in batch_sql and 'SECURITY DEFINER SET search_path=pg_catalog' in batch_sql
spatial_sql=(ROOT/'database/migrations/0003_apartment_buildings.sql').read_text()
spatial_parsed=parse_sql(spatial_sql)
assert 'apartment_buildings' in spatial_sql
# Validate new local Markdown references. Actual browser/UI validation is separate.
mds=list((ROOT/'docs').rglob('*.md'))+[ROOT/'产品基线.md']
missing=[]
for path in mds:
    for link in re.findall(r'\]\(([^)]+)\)',path.read_text()):
        link=link.split('#')[0]
        if link and not link.startswith(('http://','https://','mailto:')) and not (path.parent/link).exists():missing.append([str(path.relative_to(ROOT)),link])
assert not missing,missing
result={'date':'2026-10-30','baseline':'V12.1 temporary delivery support only','openapi':{'version':contract['openapi'],'contract_version':contract['info']['version'],'paths':len(contract['paths']),'operations':len(operations),'schemas':len(contract['components']['schemas']),'spec_validation':'passed'},'sql':{'top_level_parse':'passed','statements':len(parsed),'tables':len(tables),'incremental_migration_0004':{'top_level_parse':'passed','statements':len(batch_parsed),'database_execution':'see D1 import batch verification record'},'incremental_migration_0003':{'top_level_parse':'passed','statements':len(spatial_parsed),'database_execution':'see D1 arrival verification record'},'incremental_migration_0002':{'top_level_parse':'passed','tables':incremental_tables,'database_execution':'see D1 HTTP/local DB verification record'},'database_execution':'not_run','plpgsql_do_blocks_compiled':'not_run','postgis_and_role_integration':'not_run'},'page_spec':{'nodes':len(page_ids),'state_variants':sum(len(p['states']) for p in catalog['pages']),'action_targets_and_operations':'passed','no_recruitment_screens':'passed'},'local_doc_links':'passed','structural_contract_checks':'passed','real_device_and_cloud_tests':'not_run'}
(ROOT/'docs/technical/V12_静态校验结果.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
