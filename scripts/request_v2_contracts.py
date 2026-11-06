"""Versioned delivery models and backwards-compatible R4-07 routing."""
from copy import deepcopy


def add_request_v2_contracts(S, obj, out, ref, string, enum, integer, uid, dt, boolean):
    nullable = lambda value: {**deepcopy(value), 'nullable': True}
    schema_version = {'type': 'integer', 'enum': [2]}
    scene = enum('warehouse_shortage', 'delivery_handoff')
    terms = {
        'request_schema_version': schema_version,
        'scenario': scene,
        'task_scope': enum('partial', 'whole_route'),
        'quantity_mode': enum('exact', 'estimate', 'unknown'),
        'handoff_mode': enum('asap', 'scheduled'),
        'handoff_date': {'type': 'string', 'format': 'date'},
        'completion_mode': enum('same_day', 'next_day', 'contact'),
    }
    address_fields = {'name': nullable(string(160)), 'address_line1': nullable(string(200)),
                      'city': nullable(string(100)), 'state': nullable(string(2)),
                      'postal_code': nullable(string(12)), 'address_confirmed': boolean,
                      'address_source': enum('publisher_entered', 'mapbox_suggestion')}
    obj('WarehousePickupDraftV2', {'kind': enum('warehouse'), **address_fields}, ['kind'])
    obj('ContactHandoffV2', {'kind': enum('contact_handoff')}, ['kind'])
    pickup_input = {'oneOf': [ref('WarehousePickupDraftV2'), ref('ContactHandoffV2')]}
    obj('PickupDraftV2', {}, [])
    S['PickupDraftV2'] = pickup_input
    fields = {k: deepcopy(v) for k, v in S['RequestDraftInput']['properties'].items()
              if k not in ('kind', 'organization_id', 'accepts_partial')}
    fields.update({k: v for k, v in terms.items() if k not in ('request_schema_version', 'scenario')})
    fields['timezone'] = enum('America/Los_Angeles')
    fields['pickup'] = {'anyOf': [pickup_input, {'type': 'object', 'nullable': True, 'enum': [None]}]}
    for key in ['parcel_count', 'stop_count', 'drivers_needed', 'minimum_parcels', 'price_cents',
                'starts_at', 'pickup_deadline_at', 'delivery_deadline_at', 'expires_at']:
        fields[key] = nullable(fields[key])
        if fields[key].get('type') == 'integer':
            fields[key]['maximum'] = 2147483647
    obj('RequestDraftInputV2', {'request_schema_version': schema_version, 'scenario': scene,
                              'organization_id': uid, **fields}, ['request_schema_version', 'scenario'])
    obj('RequestPatchV2', {'request_schema_version': schema_version,
                          'expected_version': integer(1, maximum=2147483646), **fields},
        ['request_schema_version', 'expected_version'])
    obj('GapInputV2', {'request_schema_version': schema_version,
                       'expected_version': integer(1, maximum=2147483646),
                       'remaining_parcels': nullable(integer(0, maximum=2147483647)),
                       'remaining_drivers': integer(0, maximum=2147483647)},
        ['request_schema_version', 'expected_version'])
    S['GapInputV2']['anyOf'] = [{'required': ['remaining_parcels']}, {'required': ['remaining_drivers']}]
    out('WarehousePickupDetailV2', {'kind': enum('warehouse'), 'address_version': integer(1),
        **address_fields, 'address_source': enum('publisher_entered', 'provider_permanent', 'legacy_unclassified'),
        'point': {'allOf': [ref('Point')], 'nullable': True},
        'point_source': enum('unlocated', 'persistent_source')})
    S['PickupLocationDetailV2'] = {'oneOf': [ref('WarehousePickupDetailV2'), ref('ContactHandoffV2')]}
    summary = {k: deepcopy(v) for k, v in S['Request']['properties'].items() if k != 'private_payment_terms'}
    summary.update(terms)
    for key in ['task_scope', 'quantity_mode', 'handoff_mode', 'handoff_date', 'completion_mode']:
        summary[key] = nullable(summary[key])
    summary['pickup_kind'] = nullable(enum('warehouse', 'contact_handoff'))
    out('RequestSummaryV2', summary)
    out('RequestDetailV2', {**summary,
        'pickup': {'allOf': [ref('PickupLocationDetailV2')], 'nullable': True},
        'private_payment_terms': nullable(string(300))})
    snapshot = {k: deepcopy(v) for k, v in S['RequestVersion']['properties'].items() if k != 'private_payment_terms'}
    snapshot.update(terms)
    snapshot.update({'pickup_kind': nullable(enum('warehouse', 'contact_handoff')),
                     'pickup_address_version': nullable(integer(1)),
                     'publisher_display_name': nullable(string(60)), 'organization_name': nullable(string(120))})
    out('RequestVersionV2', snapshot)
    public = deepcopy(S['PublicRequestSummary']['properties'])
    public.update(terms)
    public['pickup_kind'] = nullable(enum('warehouse', 'contact_handoff'))
    out('PublicRequestSummaryV2', public)
    names = ['WarehousePickupDraftV2', 'ContactHandoffV2', 'PickupDraftV2', 'RequestDraftInputV2',
             'RequestPatchV2', 'GapInputV2', 'WarehousePickupDetailV2', 'PickupLocationDetailV2',
             'RequestSummaryV2', 'RequestDetailV2', 'RequestVersionV2', 'PublicRequestSummaryV2']
    for name in names:
        S[name]['x-implementation-stage'] = 'R4-07-local-service'
        S[name]['description'] = ('R4-07本地服务已接通；原生表单在R4-08接入。'
                                '未知数量为null、约数不构成精确剩余上限。输入不接受供应商结果/坐标/导航URL。')
    S['RequestSummaryV2']['description'] += '仅发现摘要，不含完整取件地址。'
    S['RequestDetailV2']['description'] += '完整取件信息仅在有权登录详情读取。'
    S['RequestVersionV2']['description'] += '去敏来源快照：不含地址、坐标或私下付款正文。'
    S['PublicRequestSummaryV2']['description'] += '独立游客白名单，不含取件地址、坐标及私人联系方式。'
    S['RequestDraftInputV2']['description'] += ('草稿可不完整；发布前须完整核对。asap的starts_at为空并由服务端当次生成；'
        'scheduled使用明确时刻和匹配的洛杉矶接手日。下架默认最迟接手或接手日23:59，独立于送完要求。')
    S['WarehousePickupDraftV2']['description'] += ('address_source需明确区分手填与Mapbox联想；联想地址文字也须经后台有持久许可的来源核对后保存，不能仅删除坐标后当手填存储。')


def wire_request_v2(S, paths, ref, query):
    def union(name, *items):
        S[name] = {'oneOf': [ref(item) for item in items]}
    union('RequestRead', 'Request', 'RequestDetailV2')
    union('RequestSummaryRead', 'Request', 'RequestSummaryV2')
    union('RequestDraftAny', 'RequestDraftInput', 'RequestDraftInputV2')
    union('RequestPatchAny', 'RequestPatch', 'RequestPatchV2')
    union('GapAny', 'GapInput', 'GapInputV2')
    union('RequestSnapshot', 'RequestVersion', 'RequestVersionV2')
    union('PublicRequestSummaryRead', 'PublicRequestSummary', 'PublicRequestSummaryV2')
    S['RequestPageV2'] = {'type':'object','additionalProperties':False,'required':['items','next_cursor'],
        'properties':{'items':{'type':'array','items':ref('RequestSummaryV2')},'next_cursor':{'type':'string','nullable':True}}}
    union('RequestListRead','RequestPage','RequestPageV2')
    # Empty legacy/V2 pages intentionally have the same shape.
    S['RequestListRead']={'anyOf':[ref('RequestPage'),ref('RequestPageV2')]}
    for obj,key,target in [('Application','request_summary','RequestSummaryRead'),('Message','request_snapshot','RequestSnapshot'),
                           ('Conversation','last_request_snapshot','RequestSnapshot'),('PublicRequestShare','summary','PublicRequestSummaryRead')]:
        S[obj]['properties'][key]={'allOf':[ref(target)],'nullable':True}
    S['RequestVersionPage']['properties']['items']['items']=ref('RequestSnapshot')
    for path,operations in paths.items():
        for method,op in operations.items():
            body=op.get('requestBody',{}).get('content',{}).get('application/json',{})
            if body.get('schema',{}).get('$ref') in [ref(x)['$ref'] for x in ['RequestDraftInput','RequestPatch','GapInput']]:
                old=body['schema']['$ref'].split('/')[-1]
                body['schema']=ref({'RequestDraftInput':'RequestDraftAny','RequestPatch':'RequestPatchAny','GapInput':'GapAny'}[old])
            for response in op.get('responses',{}).values():
                content=response.get('content',{}).get('application/json',{})
                old=content.get('schema',{}).get('$ref')
                if old==ref('Request')['$ref']:content['schema']=ref('RequestRead')
                if old==ref('RequestPage')['$ref']:content['schema']=ref('RequestListRead')
            if method=='get' and path in ['/v1/requests','/v1/me/requests']:
                op.setdefault('parameters',[]).append(query('request_schema_version',{'type':'integer','enum':[1,2],'default':1}))
                op['description']='默认旧版1；新版2显式查询。day在新版按洛杉矶接手日精确筛选，不按下架相交。'
