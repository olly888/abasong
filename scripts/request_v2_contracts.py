"""Prepared R4-06 models; no route opts into V2 before R4-07."""
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
                     'pickup_address_version': nullable(integer(1))})
    out('RequestVersionV2', snapshot)
    public = deepcopy(S['PublicRequestSummary']['properties'])
    public.update(terms)
    public['pickup_kind'] = nullable(enum('warehouse', 'contact_handoff'))
    out('PublicRequestSummaryV2', public)
    names = ['WarehousePickupDraftV2', 'ContactHandoffV2', 'PickupDraftV2', 'RequestDraftInputV2',
             'RequestPatchV2', 'GapInputV2', 'WarehousePickupDetailV2', 'PickupLocationDetailV2',
             'RequestSummaryV2', 'RequestDetailV2', 'RequestVersionV2', 'PublicRequestSummaryV2']
    for name in names:
        S[name]['x-implementation-stage'] = 'R4-06-prepared-not-routed'
        S[name]['description'] = ('R4-06已准备模型，R4-07接通事务及对象权限前不用于现有端点。'
                                '未知数量为null、约数不构成精确剩余上限。输入不接受供应商结果/坐标/导航URL。')
    S['RequestSummaryV2']['description'] += '仅发现摘要，不含完整取件地址。'
    S['RequestDetailV2']['description'] += '完整取件信息仅在有权登录详情读取。'
    S['RequestVersionV2']['description'] += '去敏来源快照：不含地址、坐标或私下付款正文。'
    S['PublicRequestSummaryV2']['description'] += '独立游客白名单，不含取件地址、坐标及私人联系方式。'
    S['RequestDraftInputV2']['description'] += ('草稿可不完整；发布前须完整核对。asap的starts_at为空并由服务端当次生成；'
        'scheduled使用明确时刻和匹配的洛杉矶接手日。下架默认最迟接手或接手日23:59，独立于送完要求。')
    S['WarehousePickupDraftV2']['description'] += ('address_source需明确区分手填与Mapbox联想；联想地址文字也须经后台有持久许可的来源核对后保存，不能仅删除坐标后当手填存储。')
