"""Generate the reviewable V12 contract; no cloud/network operations."""
from pathlib import Path
import re,yaml
ROOT=Path(__file__).resolve().parents[1]
S={}
def ref(n): return {'$ref':f'#/components/schemas/{n}'}
def string(n=200,**kw): return {'type':'string','maxLength':n,**kw}
def enum(*values): return {'type':'string','enum':list(values)}
def integer(lo=0,**kw): return {'type':'integer','minimum':lo,**kw}
def arr(item): return {'type':'array','items':item}
def obj(name,props,required=()):
 S[name]={'type':'object','additionalProperties':False,'properties':props}
 if required:S[name]['required']=list(required)
 return ref(name)
def out(name,props):return obj(name,props,props.keys())
def page(name,item):return out(name,{'items':arr(ref(item)),'next_cursor':{'type':'string','nullable':True}})
uid={'type':'string','format':'uuid'};dt={'type':'string','format':'date-time'};boolean={'type':'boolean'}
nullable_id={**uid,'nullable':True}; nullable_dt={**dt,'nullable':True}
out('Error',{'code':string(80),'message':string(300),'request_id':uid})
out('Ack',{'ok':boolean})
out('Job',{'job_id':uid,'status':enum('pending','processing','completed','failed')})
out('Health',{'status':enum('ok')})
obj('ProfilePatch',{'display_name':string(60,minLength=1),'bio':string(500),'vehicle_type':string(60),'locale':enum('zh-CN','en-US'),'timezone':string(80),'experience':arr(ref('ExperienceInput'))})
obj('ExperienceInput',{'carrier':string(80),'region_label':string(120),'description':string(300)},['carrier','region_label','description'])
out('Experience',{'carrier':string(80),'region_label':string(120),'description':string(300),'source':enum('self_reported','verified')})
out('Profile',{'user_id':uid,'display_name':string(60),'bio':string(500,nullable=True),'vehicle_type':string(60,nullable=True),'experience':arr(ref('Experience'))})
out('Me',{'user_id':uid,'status':enum('active','suspended','deleting','deleted'),'profile':ref('Profile'),'capabilities':arr(string(80))})
obj('BootstrapInput',{'display_name':string(60,minLength=1)},['display_name'])
out('Region',{'id':uid,'label':string(120),'timezone':string(80),'display_point':ref('Point')})
obj('Point',{'lng':{'type':'number','minimum':-180,'maximum':180},'lat':{'type':'number','minimum':-90,'maximum':90}},['lng','lat'])
out('Organization',{'id':uid,'name':string(120),'contact_user_id':uid,'verification_status':enum('self_reported','verified','rejected')})
obj('OrganizationInput',{'name':string(120,minLength=1)},['name'])
out('Apartment',{'id':uid,'name':string(160,nullable=True),'address_line1':string(200),'city':string(100),'state':string(2),'postal_code':string(12,nullable=True),'point':ref('Point'),'confidence':enum('unverified','field_verified','authorized_source')})
position={'type':'array','items':{'type':'number'},'minItems':2,'maxItems':2}
obj('BuildingGeometry',{'type':enum('MultiPolygon'),'coordinates':arr(arr(arr(position)))},['type','coordinates'])
out('ApartmentBuilding',{'id':uid,'geometry':ref('BuildingGeometry'),'label_point':ref('Point'),'street_number':string(40),'verified_at':dt})
out('ApartmentMapContext',{'apartment_id':uid,'buildings':{**arr(ref('ApartmentBuilding')),'maxItems':100}})
obj('ResolveInput',{'point':ref('Point'),'observed_at':dt,'accuracy_m':{'type':'number','minimum':0,'maximum':100000},'accuracy_permission':enum('precise','approximate')},['point','observed_at','accuracy_m','accuracy_permission'])
out('ResolveResult',{'status':enum('matched','candidates','unknown','stale_location'),'matched_id':nullable_id,'candidates':arr(ref('Apartment')),'config_version':integer(1)})
obj('AddressSuggestInput',{'query':string(200,minLength=2),'session_token':uid},['query','session_token'])
out('AddressSuggestion',{'provider_result_id':string(500),'label':string(300)})
out('AddressSuggestions',{'items':arr(ref('AddressSuggestion')),'session_token':uid,'use_mode':enum('temporary')})
obj('AddressRetrieveInput',{'provider_result_id':string(500),'session_token':uid},['provider_result_id','session_token'])
out('TemporaryAddress',{'label':string(300),'point':ref('Point'),'use_mode':enum('temporary')})
obj('ApartmentProposalInput',{'name':string(160),'address_line1':string(200),'city':string(100),'state':string(2),'postal_code':string(12),'point':ref('Point'),'source_attested':{'type':'boolean','enum':[True]}},['address_line1','city','state','point','source_attested'])
obj('CorrectionInput',{'apartment_id':uid,'proposed_address':string(300),'reason':string(500,minLength=1)},['reason'])
out('Submitted',{'id':uid,'status':enum('pending')})
obj('AccessScope',{'label':string(100),'timezone':string(80),'weekdays':arr(integer(0,maximum=6)),'start_local':string(5,pattern=r'^([01][0-9]|2[0-3]):[0-5][0-9]$'),'end_local':string(5,pattern=r'^([01][0-9]|2[0-3]):[0-5][0-9]$')})
obj('AccessInput',{'method':enum('keypad','front_desk','digital_access','no_fixed_code','other'),'value':string(500,minLength=1),'scope':ref('AccessScope'),'source_attested':{'type':'boolean','enum':[True]}},['method','value','source_attested'])
out('AccessRecord',{'id':uid,'apartment_id':uid,'method':enum('keypad','front_desk','digital_access','no_fixed_code','other'),'value':string(500),'scope':ref('AccessScope'),'contributed_at':dt,'last_success_at':nullable_dt,'last_failure_at':nullable_dt,'effective_useful':boolean,'my_feedback':{'type':'string','enum':['useful','not_useful','withdrawn'],'nullable':True},'verification_label':enum('community_contribution','verified_source')})
out('AccessList',{'items':arr(ref('AccessRecord')),'config_version':integer(1),'next_cursor':{'type':'string','nullable':True}})
out('ContributionResult',{'record_id':uid,'outcome':enum('created_pending','created_active','same_value_validation'),'contributed_at':dt})
obj('FeedbackInput',{'client_event_id':uid,'value':enum('useful','not_useful','withdrawn'),'reason':string(200)},['client_event_id','value'])
out('FeedbackResult',{'record_id':uid,'value':enum('useful','not_useful','withdrawn'),'updated_at':dt})
obj('RequestDraftInput',{'kind':enum('partial_route','whole_route','extra_drivers','vehicle_help','other_help'),'organization_id':uid,'region_id':uid,'pickup_area':string(200),'carrier':string(80),'route_label':string(80),'description':string(1000),'starts_at':dt,'pickup_deadline_at':dt,'delivery_deadline_at':dt,'expires_at':dt,'timezone':string(80),'parcel_count':integer(1),'stop_count':integer(1),'drivers_needed':integer(1),'price_cents':integer(0),'price_unit':enum('per_parcel','per_route','negotiable'),'sorted_state':enum('sorted','unsorted','unknown'),'handoff_requirement':enum('carrier_account','dsp_approval','contact_confirm'),'private_payment_terms':string(300)},['kind'])
# Patch is deliberately separate from create: kind and publisher cannot change after publish.
props={k:v for k,v in S['RequestDraftInput']['properties'].items() if k not in ('kind','organization_id')}
obj('RequestPatch',{'expected_version':integer(1),**props},['expected_version'])
obj('VersionInput',{'expected_version':integer(1)},['expected_version'])
obj('CloseInput',{'expected_version':integer(1),'status':enum('found','closed')},['expected_version','status'])
obj('GapInput',{'expected_version':integer(1),'remaining_parcels':integer(0),'remaining_drivers':integer(0)},['expected_version'])
out('Request',{'id':uid,'publisher':ref('Profile'),'organization':{'allOf':[ref('Organization')],'nullable':True},'kind':enum('partial_route','whole_route','extra_drivers','vehicle_help','other_help'),'status':enum('draft','open','found','closed','expired'),'version':integer(1),'region_id':nullable_id,'pickup_area':string(200,nullable=True),'carrier':string(80,nullable=True),'route_label':string(80,nullable=True),'description':string(1000,nullable=True),'starts_at':nullable_dt,'expires_at':nullable_dt,'pickup_deadline_at':nullable_dt,'delivery_deadline_at':nullable_dt,'timezone':string(80),'parcel_count':{'type':'integer','nullable':True},'drivers_needed':{'type':'integer','nullable':True},'remaining_parcels':{'type':'integer','nullable':True},'remaining_drivers':{'type':'integer','nullable':True},'price_cents':{'type':'integer','nullable':True},'price_unit':{'type':'string','nullable':True,'enum':['per_parcel','per_route','negotiable']},'currency':enum('USD'),'sorted_state':{'type':'string','nullable':True},'handoff_requirement':{'type':'string','nullable':True},'private_payment_terms':string(300,nullable=True)})
out('RequestVersion',{'request_id':uid,'version':integer(1),'kind':string(50),'region_id':uid,'starts_at':dt,'expires_at':dt,'price_cents':{'type':'integer','nullable':True},'price_unit':string(30,nullable=True),'parcel_count':{'type':'integer','nullable':True},'handoff_requirement':string(50,nullable=True)})
S['Request']['properties']['stop_count']={'type':'integer','nullable':True}
S['Request']['required'].append('stop_count')
snapshot_fields={'pickup_area':string(200,nullable=True),'carrier':string(80,nullable=True),'route_label':string(80,nullable=True),'pickup_deadline_at':nullable_dt,'delivery_deadline_at':nullable_dt,'timezone':string(80),'drivers_needed':{'type':'integer','nullable':True},'stop_count':{'type':'integer','nullable':True},'sorted_state':string(30,nullable=True),'currency':enum('USD'),'private_payment_terms':string(300,nullable=True)}
S['RequestVersion']['properties'].update(snapshot_fields)
S['RequestVersion']['required'].extend(snapshot_fields)
obj('ApplyInput',{'expected_arrival_at':dt,'capacity_parcels':integer(1),'observed_request_version':integer(1)},['expected_arrival_at','observed_request_version'])
out('Application',{'id':uid,'request_id':uid,'applicant_id':uid,'status':enum('applied','withdrawn'),'expected_arrival_at':dt,'capacity_parcels':{'type':'integer','nullable':True},'observed_request_version':integer(1),'contacted_at':nullable_dt,'conversation_id':uid})
obj('AvailabilityInput',{'expected_version':integer(0),'enabled':boolean,'starts_at':dt,'ends_at':dt,'region_ids':arr(uid),'capacity_parcels':integer(1),'latest_finish_at':dt},['expected_version','enabled','starts_at','ends_at','region_ids'])
out('Availability',{'user_id':uid,'version':integer(1),'enabled':boolean,'currently_available':boolean,'starts_at':dt,'ends_at':dt,'region_ids':arr(uid),'capacity_parcels':{'type':'integer','nullable':True},'latest_finish_at':nullable_dt})
out('Driver',{'profile':ref('Profile'),'availability':ref('Availability'),'regions':arr(ref('Region'))})
S['Driver']['properties']['availability']={'allOf':[ref('Availability')],'nullable':True}
obj('ConversationInput',{'other_user_id':uid,'source_request_id':uid,'source_request_version':integer(1)},['other_user_id'])
out('Conversation',{'id':uid,'other_profile':ref('Profile'),'unread_count':integer(0),'last_sequence':integer(0),'updated_at':dt})
obj('MessageInput',{'client_message_id':uid,'kind':enum('text','request_card'),'text':string(2000,minLength=1),'source_request_id':uid,'source_request_version':integer(1)},['client_message_id','kind'])
out('Message',{'id':uid,'sequence':integer(1),'conversation_id':uid,'sender_id':uid,'kind':enum('text','request_card'),'text':string(2000,nullable=True),'request_snapshot':{'allOf':[ref('RequestVersion')],'nullable':True},'created_at':dt})
obj('ReadInput',{'last_read_sequence':integer(0)},['last_read_sequence'])
obj('MeetingShareInput',{'conversation_id':uid,'details':string(1000,minLength=1)},['conversation_id','details'])
out('MeetingDetails',{'request_id':uid,'conversation_id':uid,'details':string(1000)})
obj('ContactInput',{'private_note':string(300)})
out('Contact',{'profile':ref('Profile'),'private_note':string(300,nullable=True)})
obj('PostInput',{'body':string(2000,minLength=1),'request_id':uid},['body'])
out('Post',{'id':uid,'author':ref('Profile'),'body':string(2000),'request':{'allOf':[ref('Request')],'nullable':True},'created_at':dt})
obj('CommentInput',{'body':string(1000,minLength=1)},['body'])
out('Comment',{'id':uid,'post_id':uid,'author':ref('Profile'),'body':string(1000),'created_at':dt})
out('Notification',{'id':uid,'kind':string(80),'object_type':string(60),'object_id':uid,'read_at':nullable_dt,'created_at':dt})
obj('DeviceInput',{'installation_id':uid,'platform':enum('ios','android'),'push_token':string(500),'enabled':boolean},['installation_id','platform','enabled'])
out('Device',{'id':uid,'installation_id':uid,'platform':enum('ios','android'),'enabled':boolean})
obj('Preferences',{'chat_push':boolean,'request_push':boolean,'system_push':boolean},['chat_push','request_push','system_push'])
obj('ReportInput',{'object_type':enum('apartment','access_record','request','user','post','comment','message'),'object_id':uid,'reason':string(1000,minLength=1)},['object_type','object_id','reason'])
out('Report',{'id':uid,'object_type':string(60),'object_id':uid,'status':enum('open','reviewing','resolved','dismissed'),'created_at':dt})
obj('ReviewInput',{'object_type':enum('apartment','access_record','request','post','comment','user'),'object_id':uid,'action':enum('approve','reject','invalidate','withdraw','suspend','restore'),'reason':string(1000,minLength=1),'expected_version':integer(1)},['object_type','object_id','action','reason'])
obj('CapabilityInput',{'user_id':uid,'capability':enum('access.read','access.contribute','request.publish','request.apply'),'valid_until':dt,'reason':string(500,minLength=1)},['user_id','capability','valid_until','reason'])
out('CapabilityGrant',{'id':uid,'user_id':uid,'capability':string(80),'valid_until':dt,'revoked_at':nullable_dt})
page('CapabilityGrantPage','CapabilityGrant')
obj('ReasonInput',{'reason':string(1000,minLength=1)},['reason'])
out('OpsReveal',{'object_id':uid,'value':string(2000),'audit_id':uid})
out('PublicConfig',{'version':integer(1),'automatic_match_enabled':boolean,'poll_active_seconds':integer(1),'poll_list_seconds':integer(1),'feedback_window_days':integer(1)})
# V12.1: temporary delivery support only; no recruitment/employment modes.
support_fields={'accepts_partial':boolean,'minimum_parcels':{'type':'integer','minimum':1,'nullable':True},'experience_requirement':enum('any','delivery_experience','carrier_experience')}
for name in ['RequestDraftInput','RequestPatch','Request','RequestVersion']:
 S[name]['properties'].update(support_fields)
 if name in ['Request','RequestVersion']:S[name]['required'].extend(support_fields)
 S[name]['properties']['pickup_region_id']=nullable_id if name in ['Request','RequestVersion'] else uid
 if name in ['Request','RequestVersion']:S[name]['required'].append('pickup_region_id')
 if name in ['RequestDraftInput','RequestPatch']:S[name]['properties'].pop('pickup_area',None)
S['Application']['properties']['request_summary']={'allOf':[ref('Request')],'nullable':True}
S['Application']['required'].append('request_summary')
S['AccessRecord']['properties']['contributor_display_name']=string(60)
S['AccessRecord']['required'].append('contributor_display_name')
out('ContributionSummary',{'id':uid,'record_id':uid,'apartment_id':uid,'address_label':string(300),'event_type':enum('created','same_value_validation','withdrawal_requested'),'record_status':enum('pending','active','review','invalid','withdrawn'),'can_withdraw_record':boolean,'occurred_at':dt})
page('ContributionSummaryPage','ContributionSummary')
out('InboxSummary',{'unread_conversations':integer(0),'unread_messages':integer(0),'unread_notifications':integer(0)})
obj('ShareCreateInput',{'public_preview_confirmed':{'type':'boolean','enum':[True]}},['public_preview_confirmed'])
out('RequestShare',{'id':uid,'public_url':string(1000),'expires_at':dt})
out('PublicRequestSummary',{'carrier':string(80,nullable=True),'kind':string(50),'region_label':string(200),'pickup_area':string(200,nullable=True),'starts_at':dt,'expires_at':dt,'parcel_count':{'type':'integer','nullable':True},'drivers_needed':{'type':'integer','nullable':True},'minimum_parcels':{'type':'integer','nullable':True},'accepts_partial':boolean,'price_cents':{'type':'integer','nullable':True},'price_unit':string(30,nullable=True),'currency':enum('USD'),'experience_requirement':string(50),'public_publisher_name':string(60),'public_organization_name':string(120,nullable=True)})
out('PublicRequestShare',{'status':enum('open','ended'),'title':string(200),'summary':{'allOf':[ref('PublicRequestSummary')],'nullable':True}})
for item in ['Apartment','Region','Request','RequestVersion','Application','Driver','Conversation','Message','Contact','Post','Comment','Notification','Report','AccessRecord']:
 page(item+'Page',item)
paths={}
# Personal apartment library: owner-only DTOs; never reuse as public data.
obj('LibraryCreate',{'apartment_id':uid,'address':string(300,minLength=1),'name':string(160),'region':string(60)},[])
S['LibraryCreate']['oneOf']=[{'required':['apartment_id'],'not':{'required':['address']}},{'required':['address'],'not':{'required':['apartment_id']}}]
obj('LibraryPatch',{'expected_version':integer(1),'name':string(160),'region':string(60),'favorite':boolean},['expected_version'])
out('LibraryEntry',{'id':uid,'apartment_id':nullable_id,'name':string(160),'address':string(300),'region':string(60),'favorite':boolean,'version':integer(1),'private_record_count':integer(),'updated_at':dt})
page('LibraryPage','LibraryEntry')
obj('PrivateRecordCreate',{'value':string(32,minLength=1),'scope_label':string(100,minLength=1),'note':string(300)},['value','scope_label'])
obj('PrivateRecordPatch',{'expected_version':integer(1),'value':string(32,minLength=1),'scope_label':string(100,minLength=1),'note':string(300)},['expected_version','value','scope_label'])
out('PrivateRecord',{'id':uid,'entry_id':uid,'value':string(32),'scope_label':string(100),'note':string(300),'version':integer(1),'updated_at':dt})
out('LibraryDetail',{'entry':ref('LibraryEntry'),'records':arr(ref('PrivateRecord'))})
obj('PrivateShareInput',{'expected_version':integer(1),'source_attested':{'type':'boolean','enum':[True]}},['expected_version','source_attested'])
def query(name,schema,required=False):return {'name':name,'in':'query','required':required,'schema':schema}
def op(path,method,operation,summary,response='Ack',body=None,code=200,cap=None,list_query=False,queries=None,idem=False,internal=False,public=False,sensitive=False):
 params=[{'name':v,'in':'path','required':True,'schema':uid} for v in re.findall(r'{([^}]+)}',path)]
 if list_query:params += [query('cursor',string(1000)),query('limit',integer(1,maximum=100,default=20))]
 params += queries or []
 if idem:params.append({'name':'Idempotency-Key','in':'header','required':True,'schema':uid})
 res={str(code):{'description':'成功；202 表示已接受任务，非最终完成','headers':{'X-Request-ID':{'schema':uid,'description':'追踪ID，不含个人数据'}},'content':{'application/json':{'schema':ref(response)}}}}
 if sensitive:res[str(code)]['headers']['Cache-Control']={'schema':{'type':'string','enum':['no-store']},'description':'敏感响应不缓存'}
 for c,desc in [('400','输入或跨字段约束错误'),('401','认证失败'),('403','权限不足'),('404','不存在或不可见'),('409','版本/状态/幂等内容冲突'),('422','业务条件不满足'),('429','限流'),('503','依赖暂不可用')]:
  res[c]={'description':desc,'content':{'application/json':{'schema':ref('Error')}}}
 data={'operationId':operation,'summary':summary,'tags':[path.split('/')[2] if path.startswith('/v1/') else 'health'],'responses':res}
 if params:data['parameters']=params
 if body:data['requestBody']={'required':True,'content':{'application/json':{'schema':ref(body)}}}
 if cap:data['x-required-capabilities']=cap
 if internal:data['x-internal']=True;data['x-requires-staff-mfa']=True
 if public:data['security']=[]
 if sensitive:data['x-sensitive-response']=True
 paths.setdefault(path,{})[method]=data
op('/health/live','get','healthLive','进程存活；不返回服务秘密','Health',public=True)
op('/v1/me/bootstrap','post','bootstrapMe','同步Auth sub，不能自授工作资格','Me','BootstrapInput',idem=True)
op('/v1/me','get','getMe','本人资料及当前能力','Me')
op('/v1/me/profile','patch','patchMyProfile','修改本人白名单字段；经验source不可自行verified','Profile','ProfilePatch')
op('/v1/me','delete','deleteMyAccount','最近登录校验；提交删除任务','Job',code=202)
op('/v1/regions','get','listRegions','可服务区域','RegionPage',list_query=True)
op('/v1/me/organization','put','putMyOrganization','最小组织来源；不允许自选审核状态','Organization','OrganizationInput')
op('/v1/me/organization','get','getMyOrganization','本人最小组织来源；未设置返回404','Organization')
op('/v1/config','get','getPublicConfig','仅公开客户端需要的配置；无密钥','PublicConfig')
op('/v1/apartments/{apartment_id}/map-context','get','getApartmentMapContext','已核对且有持久使用许可的建筑与门牌号；不含进入资料','ApartmentMapContext',sensitive=True)
op('/v1/apartments/resolve','post','resolveApartment','前台位置候选；只有版本化现场证据、可信范围与精度全部满足才自动匹配，不保存轨迹','ResolveResult','ResolveInput',sensitive=True)
op('/v1/apartments','get','searchApartments','自有公寓检索，无密码','ApartmentPage',list_query=True,queries=[query('query',string(200)),query('region_id',uid)])
op('/v1/apartments/{apartment_id}','get','getApartment','公寓元信息，无密码','Apartment')
op('/v1/search/addresses/suggest','post','suggestAddresses','Mapbox临时地址联想；不落永久库','AddressSuggestions','AddressSuggestInput',sensitive=True)
op('/v1/search/addresses/retrieve','post','retrieveAddress','临时地址选择；来源用途受限','TemporaryAddress','AddressRetrieveInput',sensitive=True)
op('/v1/apartments/proposals','post','proposeApartment','自有/授权来源的新公寓提议，待核验','Submitted','ApartmentProposalInput',code=201,cap=['access.contribute'],idem=True)
op('/v1/apartment-corrections','post','correctApartment','提交错栋/地址更正','Submitted','CorrectionInput',code=201,idem=True)
op('/v1/apartments/{apartment_id}/access-records','get','readAccessRecords','资格和对象校验后返回密码；有用优先+贡献时间倒序','AccessList',cap=['access.read'],list_query=True,sensitive=True)
op('/v1/apartments/{apartment_id}/access-records','post','contributeAccess','有权来源；同码同范围变验证事件','ContributionResult','AccessInput',code=201,cap=['access.contribute'],idem=True)
op('/v1/access-records/{record_id}/feedback','put','feedbackAccess','覆盖本人当前反馈且追加不可变事件','FeedbackResult','FeedbackInput',cap=['access.read'])
op('/v1/access-records/{record_id}','delete','withdrawAccess','仅本人贡献或运营；停止正文展示')
op('/v1/me/contributions','get','listMyContributions','本人贡献元数据，不含正文；查看密码仍需有效资格','ContributionSummaryPage',list_query=True)
op('/v1/me/apartment-library','get','listMyApartmentLibrary','本人摘要，不含密码；私人地址按owner授权返回','LibraryPage',list_query=True,sensitive=True,queries=[query('apartment_id',uid)])
op('/v1/me/apartment-library','post','createMyApartmentEntry','收藏已收录公寓或保存自填地址，二选一','LibraryEntry','LibraryCreate',code=201,idem=True,sensitive=True)
op('/v1/me/apartment-library/{entry_id}','get','getMyApartmentEntry','仅owner揭示私人正文；不代表共享查看资格','LibraryDetail',sensitive=True)
op('/v1/me/apartment-library/{entry_id}','patch','patchMyApartmentEntry','本人区域/名称/收藏，版本校验','LibraryEntry','LibraryPatch',idem=True,sensitive=True)
op('/v1/me/apartment-library/{entry_id}','delete','deleteMyApartmentEntry','仅本人项及私存；不删除共享历史')
op('/v1/me/apartment-library/{entry_id}/records','post','createMyPrivateRecord','仅私存，不产生共享贡献或有用票','PrivateRecord','PrivateRecordCreate',code=201,idem=True,sensitive=True)
op('/v1/me/private-access-records/{private_record_id}','patch','patchMyPrivateRecord','本人修改不覆盖共享；旧版本409','PrivateRecord','PrivateRecordPatch',idem=True,sensitive=True)
op('/v1/me/private-access-records/{private_record_id}','delete','deleteMyPrivateRecord','仅删除本人私存')
op('/v1/me/private-access-records/{private_record_id}/share','post','shareMyPrivateRecord','owner和当前贡献能力；只共享码/门别，私人备注不共享','ContributionResult','PrivateShareInput',code=201,cap=['access.contribute'],idem=True)
op('/v1/requests','get','listRequests','仅开放且未到期的可见需求','RequestPage',list_query=True,queries=[query('region_id',uid),query('query',string(200)),query('kind',enum('partial_route','whole_route','extra_drivers','vehicle_help','other_help'))])
op('/v1/requests','post','createDraft','创建本人需求草稿','Request','RequestDraftInput',code=201,cap=['request.publish'],idem=True)
op('/v1/requests/{request_id}','get','getRequest','草稿仅本人；终态保留供查看','Request')
op('/v1/requests/{request_id}','patch','updateRequest','本人更新条件与版本；关键变动通知','Request','RequestPatch',cap=['request.publish'])
op('/v1/requests/{request_id}','delete','discardDraft','仅本人未发布草稿软丢弃；已发布不可删除')
op('/v1/requests/{request_id}/publish','post','publishRequest','完整字段/时间/接手条件检查后发布','Request','VersionInput',cap=['request.publish'],idem=True)
op('/v1/requests/{request_id}/close','post','closeRequest','本人标记已找到或关闭，不等同履约','Request','CloseInput',idem=True)
op('/v1/requests/{request_id}/reopen','post','reopenRequest','本人重开前必须已有有效日期与截止；生成新版本','Request','VersionInput',cap=['request.publish'],idem=True)
op('/v1/requests/{request_id}/gap','patch','updateRequestGap','本人确认剩余缺口；不按报名数自动扣减','Request','GapInput')
op('/v1/requests/{request_id}/versions','get','getRequestVersions','仅发布者和该需求报名者；去敏快照','RequestVersionPage',list_query=True)
op('/v1/requests/{request_id}/applications','post','applyToRequest','报名和两人会话同事务；不能报名自己需求','Application','ApplyInput',code=201,cap=['request.apply'],idem=True)
op('/v1/requests/{request_id}/applications','get','listRequestApplications','仅发布者查看报名列表','ApplicationPage',list_query=True)
op('/v1/applications/{application_id}','delete','withdrawApplication','仅报名者撤回')
op('/v1/applications/{application_id}/contacted','put','markApplicationContacted','仅发布者标已联系，非已答应/到场')
op('/v1/me/requests','get','listMyRequests','本人草稿与发布记录','RequestPage',list_query=True)
op('/v1/me/applications','get','listMyApplications','本人报名与当前需求状态','ApplicationPage',list_query=True)
op('/v1/me/availability','get','getMyAvailability','本人可用声明；不存在返回404','Availability')
op('/v1/me/availability','put','setMyAvailability','首建expected_version=0，更新校验版本；后台到期','Availability','AvailabilityInput')
op('/v1/drivers','get','listAvailableDrivers','仅主动开放且时段有效的区域司机','DriverPage',list_query=True,queries=[query('region_id',uid),query('carrier',string(80))])
op('/v1/drivers/{user_id}','get','getDriver','最小公开司机资料及区域，不含手机号/轨迹','Driver')
op('/v1/conversations','get','listConversations','仅本人参与的会话','ConversationPage',list_query=True)
op('/v1/conversations','post','createConversation','双向屏蔽检查；同一对用户复用会话','Conversation','ConversationInput',code=201,idem=True)
op('/v1/conversations/{conversation_id}/messages','get','listMessages','仅参与者；sequence增量','MessagePage',list_query=True,queries=[query('after_sequence',integer(0))],sensitive=True)
op('/v1/conversations/{conversation_id}/messages','post','sendMessage','仅参与者且未屏蔽；client_message_id去重','Message','MessageInput',code=201,idem=True,sensitive=True)
op('/v1/conversations/{conversation_id}/read','put','readConversation','水位只能前进且属于该会话','Ack','ReadInput')
op('/v1/requests/{request_id}/meeting-shares','post','shareMeeting','仅发布者向已关联未屏蔽会话明确分享精确集合点','Ack','MeetingShareInput',idem=True)
op('/v1/requests/{request_id}/meeting-shares/{conversation_id}','get','getSharedMeeting','仅发布者或已获共享的该会话参与者','MeetingDetails',sensitive=True)
op('/v1/requests/{request_id}/meeting-shares/{conversation_id}','delete','revokeMeetingShare','仅发布者撤回集合点授权')
op('/v1/me/contacts','get','listMyContacts','本人常联系及私密备注','ContactPage',list_query=True)
op('/v1/me/contacts/{user_id}','put','saveContact','已发生会话且未屏蔽的联系人','Contact','ContactInput')
op('/v1/me/contacts/{user_id}','delete','deleteContact','删除本人常联系')
op('/v1/me/blocks/{user_id}','put','blockUser','本人屏蔽；阻止新私聊/报名/通知')
op('/v1/me/blocks/{user_id}','delete','unblockUser','解除本人屏蔽')
op('/v1/posts','get','listPosts','互助文字与同ID需求卡','PostPage',list_query=True)
op('/v1/posts','post','createPost','创建文字动态；不许夹带门码/住户信息','Post','PostInput',code=201,idem=True)
op('/v1/posts/{post_id}','get','getPost','可见动态详情；引用需求按当前权限返回','Post')
op('/v1/posts/{post_id}','delete','removePost','仅作者或有权运营软删除')
op('/v1/posts/{post_id}/comments','get','listComments','可见动态基础回复','CommentPage',list_query=True)
op('/v1/posts/{post_id}/comments','post','createComment','基础文字回复','Comment','CommentInput',code=201,idem=True)
op('/v1/comments/{comment_id}','delete','removeComment','仅作者或有权运营软删除')
op('/v1/me/posts','get','listMyPosts','本人发布文字记录','PostPage',list_query=True)
op('/v1/me/notifications','get','listNotifications','本人站内通知；无密码/消息正文','NotificationPage',list_query=True)
op('/v1/me/inbox-summary','get','getInboxSummary','本人消息与通知未读汇总，无正文','InboxSummary')
op('/v1/me/notifications/{notification_id}/read','put','readNotification','本人标已读')
op('/v1/me/notification-preferences','get','getNotificationPreferences','本人推送偏好','Preferences')
op('/v1/me/notification-preferences','put','setNotificationPreferences','站内事件仍保留','Preferences','Preferences')
op('/v1/me/devices','post','registerDevice','绑定当前用户的安装实例/令牌','Device','DeviceInput',code=201,idem=True)
op('/v1/me/devices/{device_id}','delete','unbindDevice','仅本人设备退出解绑')
op('/v1/reports','post','submitReport','校验可见对象；仅提交不自动封禁','Report','ReportInput',code=201,idem=True)
op('/v1/requests/{request_id}/share-links','post','createRequestShare','仅发布者确认公开摘要后生成链接，不能分享草稿','RequestShare','ShareCreateInput',code=201,idem=True)
op('/v1/request-shares/{share_id}','delete','revokeRequestShare','仅创建者/发布者撤销公开摘要token')
op('/v1/public/request-shares/{token}','get','getPublicRequestShare','游客只读专用公开摘要；终态仅标题和状态','PublicRequestShare',public=True)
op('/v1/request-shares/{token}/resolve','get','resolveRequestShare','登录回跳后查最新完整需求；不继承游客数据权限','Request')
op('/v1/ops/reports','get','listOpsReports','内部员工审核队列；MFA与本地能力','ReportPage',list_query=True,cap=['ops.review'],internal=True)
op('/v1/ops/reviews','post','reviewObject','审核动作有对象规则/版本/理由，写审计','Ack','ReviewInput',cap=['ops.review'],internal=True,idem=True)
op('/v1/ops/capabilities','post','grantCapability','仅用户管理权限；不能由此接口授员工权限','CapabilityGrant','CapabilityInput',cap=['ops.user_manage'],internal=True,idem=True)
op('/v1/ops/users/{user_id}/capabilities','get','listUserCapabilities','仅员工查看工作能力记录；不返回认证口令','CapabilityGrantPage',cap=['ops.user_manage'],internal=True,list_query=True)
op('/v1/ops/capabilities/{capability_id}','delete','revokeCapability','撤销工作能力，不允许此接口管理员工权限','Ack',cap=['ops.user_manage'],internal=True)
op('/v1/ops/access-records/{record_id}/reveal','post','revealForReview','仅必要核验，MFA+揭示权限+理由；强审计','OpsReveal','ReasonInput',cap=['ops.reveal'],internal=True,sensitive=True)
from import_contracts import add_import_contracts
add_import_contracts(S, obj, out, ref, string, enum, integer, arr, uid, dt,
                     nullable_id, boolean, page, op, paths)
paths['/v1/requests']['get']['parameters'].append(query('carrier',string(80)))
# OpenAPI 3.0 nullable does not override a referenced non-nullable object in allOf.
# Explicit null branch keeps ended shares and undeclared driver availability valid.
def normalize_nullable_refs(node):
 if isinstance(node,list):return [normalize_nullable_refs(x) for x in node]
 if not isinstance(node,dict):return node
 if node.get('nullable') and 'allOf' in node:
  original={'allOf':node['allOf']}
  extras={k:v for k,v in node.items() if k not in ('nullable','allOf')}
  return {**extras,'anyOf':[normalize_nullable_refs(original),{'type':'object','nullable':True,'enum':[None]}]}
 return {k:normalize_nullable_refs(v) for k,v in node.items()}
S=normalize_nullable_refs(S)
D={'openapi':'3.0.3','info':{'title':'Abasong V12.1 API Contract','version':'12.1.0','description':'设计契约，尚未实现或部署。OTP/refresh由Supabase Auth SDK完成。输出为直接DTO；身份来自验证JWT，不接收任意actor_id。参数约束之外的对象权限、状态机、跨字段校验见V12权限和数据库文档。x-required-capabilities仅为契约元数据，必须由服务端实现。仅专用public/request-shares摘要允许游客读取；不得扩大正常Request或密码接口权限。'},'servers':[{'url':'https://api.abasong.invalid','description':'占位域名，非实际服务'}],'security':[{'BearerAuth':[]}],'paths':paths,'components':{'securitySchemes':{'BearerAuth':{'type':'http','scheme':'bearer','bearerFormat':'JWT'}},'schemas':S}}
(ROOT/'docs/technical/openapi-v12.yaml').write_text(yaml.safe_dump(D,allow_unicode=True,sort_keys=False),encoding='utf-8')
print(f'Generated {len(paths)} paths, {sum(len(v) for v in paths.values())} operations, {len(S)} schemas')
