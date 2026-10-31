"""Build the page/state catalogue and reviewable specification from one source."""
from pathlib import Path
import json,csv
ROOT=Path(__file__).resolve().parents[1]
pages=[]
def page(id,name,surface,entry,info,actions,states,api,req,accept):
 pages.append(dict(id=id,name=name,surface=surface,entry=entry,information=info.split('|'),actions=[dict(zip(['label','target','result'],a.split('::',2))) for a in actions.split('|')],states=states.split('|'),api_operations=api.split(',') if api else [],requirements=req.split(','),acceptance=accept))
page('A02','手机号登录','全屏二级页；保留来源意图','报名、联系、看受控资料或我的登录入口','返回|+1区号选择与手机号|获取验证码|必要协议链接', '返回::G03::退出登录并回原来源，不丢草稿|获取验证码::A03::校验格式后请求OTP，禁重复请求','默认|号码错误|发送中|限流/失败|来源需求已终止','', 'AUTH,V12-15','登录前后身份变化不复用上一个账号的缓存；无业务资料在此页公开。')
page('A03','验证码与恢复','二级页，同一认证流程','A02发送成功','掩码手机号|验证码输入|重发倒计时|更改号码|验证错误', '更改号码::A02::清除验证码并保留安全来源|验证::A04::Auth成功后bootstrap，老用户直接回来源|重发::A03::遵守供应商限流，不默认每点发短信','输入|验证中|错误/过期|重发受限|登录成功回跳','bootstrapMe','AUTH,V12-15','OTP不进日志；登录后重新请求来源对象，不能自动提交旧报价报名。')
page('A04','首次最小资料','二级页，仅新账号','A03新账号','显示名|保存按钮；经验和车辆不强制在首次查码前填写','保存::H01::bootstrap完成后回原意图，H01只是无来源时默认','空|保存中|校验失败|资格待审核','bootstrapMe,patchMyProfile','AUTH','显示名不能自带官方核验身份；登录不自动授予密码资格。')
page('H01','首页·公寓','首页根状态，公寓卡收起/展开','首次启动、首页导航、主动切公寓','搜索、消息|公寓/找活/找人|前台真实定位/稳定匹配/建筑高亮/建筑内门牌号|收起：名称/英文地址/首条密码/贡献时间|展开：各条密码、必要门别/时段、实测时间、反馈、添加|独立＋发需求|三项底部导航', '搜索::S01::带公寓视图|消息::M01::开统一消息|点卡/拖手柄::H01::同一面板展开，不新建一层页|不是这栋::L01::候选/手动纠错|点密码::B01::大字模式|有用/没用::H01::作用于本记录；失败回滚，重排保留阅读锚点|添加/更新::B02::公寓ID带入；新增记录不覆盖历史|＋发需求::P01::独立于卡片|定位::H01::主动解除选择锁定后重新匹配','冷启动|唯一可信范围稳定命中收起|建筑映射缺失|来源过期|手动选择锁定|历史展开|多候选|暂无密码|无固定码|无资格|定位拒绝|粗略/旧位置|弱网/底图失败|记录失效/撤回|反馈提交失败','resolveApartment,getApartment,getApartmentMapContext,readAccessRecords,feedbackAccess','V12-01,V12-02,V12-03,V12-04,V12-05,V12-06,V12-07,V12-08','首次默认公寓；卡外无有用/没用/更新行，无楼宇/入口/停车菜单；GPS不抢走已选公寓；最近点不构成自动认定，未经核对不画建筑关联门牌号，来源无效不绘制。')
page('H02','首页·找活','与H01同一路由的地图状态','首页切找活','搜索与消息|区域需求标记/聚合|日期/支援类型筛选|选中卡：配送区、具体日期/时段、数量/人数、最低量、报价单位、截止/缺口|独立发需求与导航', '点标记::H02::选中并更新卡，不切身份|卡片::D01::看需求条件|搜索/筛选::S01::找区域/承运商/支援类型|＋发需求::P01::统一发布|列表::H02::同视图切可操作需求列表，不叠新导航','有需求|列表替代地图|无需求|区域无结果|过期/关闭即时移除|加载失败','listRequests,listRegions','V12-09,ADD-01,ADD-03','地图定位配送区，取件地区另列；所有配送支援明确当次件数与时间，不伪造报价或到场承诺；只有一条可见选中卡。')
page('H03','首页·找人','与H01同一路由的地图状态','首页切找人','区域标记/聚合|服务区域/相关经验筛选|司机卡：显示名、声明时段、容量、经验来源|我的可接活入口|发需求与导航', '司机卡::D02::看最小档案|搜索/筛选::S01::按服务区/承运商|设置可接活::U03::本人主动开放|列表::H03::同状态可操作司机列表|＋发需求::P01::统一入口','有效可用司机|列表替代|无人可接|司机未在线但声明有效|时段刚到期|加载失败','listAvailableDrivers,listRegions','V12-13,V12-14','不画精确车点/轨迹；不以关闭App判不可用；区域中心不叫司机当前位置。')
page('S01','搜索与筛选','二级搜索页，依来源切内容','H01/H02/H03搜索','返回/输入/清除|公寓：自有地址名称，外部临时候选独立来源|找活：区域、承运商、支援类型、日期|找人：区域、承运商经验|结果列表/空态', '返回::H01::回原地图视图与选中对象，非固定切公寓|选择公寓::H01::锁定用户选中公寓后查权限与记录|选择需求::D01::展示当前版本|选择司机::D02::展示最小档案|选择外部地址::L01::仅用于当前定位候选，不默认入永久库','空查询|输入联想|自有结果|仅外部地址|无结果|失败|筛选后无结果','searchApartments,suggestAddresses,retrieveAddress,listRequests,listAvailableDrivers','V12-02,V12-08,V12-18,ADD-03','不持久保存敏感搜索历史；切来源调整字段，不用全站万能搜索混放私人账号。')
page('L01','选择正确公寓','地图底部选择面板','多候选、不是这栋、外部地址选择','当前候选地址/名称|地图候选对应高亮|手动搜索|没有这栋/纠错', '选这栋::H01::锁定并查询，不拿最近邻码代替|搜索地址::S01::带当前搜索词|没有这栋::B02::先提交公寓提议再贡献，均待规则核验','多栋|仅地址无公寓|候选已撤回|提交纠错失败','getApartment,proposeApartment,correctApartment','V12-02,V12-08','外部临时地址不自动变有权长期存储的自有公寓；无匹配能退出。')
page('B01','密码大字','轻量全屏/弹层','H01点单条密码','所属地址|该条密码/进入方式大字|必要适用范围|关闭','关闭::H01::恢复原展开位置','正常|记录已撤回/资格失效|重新加载失败','readAccessRecords','V12-07,V12-17','退出清敏感内存；不提供批量复制/分享密码按钮；不把已失效缓存继续显示。')
page('B02','贡献密码/进入方式','编辑面板，可随键盘展开','H01添加/更新，L01无这栋','固定所属公寓/纠错入口|密码或进入方式|可选门别/时段|有权分享来源确认|保存；未知公寓先提议地址','保存::H01::新增待审核/可用记录或同码验证；不覆盖原记录|取消::G03::未提交内容仅内存保留，本轮不将明文草稿持久化|改公寓::L01::先确认目标再提交','空|同码验证|新记录|来源未确认|权限不足|待审核|保存失败|公寓提议待审核','contributeAccess,proposeApartment','V12-04,V12-05,V12-06,V12-07','保存成功状态准确，不将pending放进可用首码；0/O、1/I、#/*可辨；请求重试复用幂等键。')
page('P01','统一发需求选择','首页工具展开面板，合并旧P02','任一地图＋发需求、司机圈发需求','配送找人/车辆求助/其他配送求助|配送子类：部分包裹/整条线路/增加司机|增加司机指本次配送临时缺人','配送类型::P03::创建对应表单，保留类型草稿|车辆/其他::P04::打开共用短表单|取消::H01::恢复来源视图','一级类别|配送子类|已有草稿选择','createDraft','V12-09,ADD-01','司机DSP共用，无角色工作台；发布后改类型走复制新草稿。')
page('P03','配送找人发布/编辑','全屏表单；类型内短分组','P01或P09编辑/复制','基础：承运商、配送区、单一取件区|时间：具体日期、开始时段与有效截止|数量：当次总量/人数/拆分/最低量|报价金额+单位或议价|理货/接手条件|相关配送经验要求|可选：车型/特殊配送条件与私下付款约定|提交摘要与发布', '发布::D01::先校验和摘要确认，再发布成功回本人详情|保存草稿::U04::仅本人可见|返回::G03::选择保留草稿或放弃，不丢状态|切换类型::P01::仅未发布可切；已发布不提供此项','部分包裹|整线|临时增人|联系议价|最低量错误|不同取件/配送区域|编辑版本冲突|提交中/失败','createDraft,updateRequest,publishRequest','V12-09,V12-11,ADD-01,ADD-02,ADD-03,ADD-04','每条配送支援明确当次件数/时段；不设招聘周期/试线/带教流程；无代收/支付选项；未填金额不显示$0。')
page('P04','车辆/其他配送求助','复用简短发布表单','P01车辆/其他','求助类型|大致区域|时间/截止|必要说明|联系入口','发布::D01::创建普通同行求助，不承诺专业到场|返回::G03::保留或放弃草稿','车辆|其他|缺字段|发布失败','createDraft,publishRequest','V12-09','车辆修理和包裹找人是两类需求，用户可另发配送找人，不自动生成专业维修订单。')
page('D01','需求详情','二级页；本人/他人不同动作','H02、司机圈需求卡、通知、我的、分享登录回跳','状态/支援类型/具体联系人来源|配送区、取件区、承运商|当次包裹总量/剩余件数/临时所需人数|最低量/拆分、报价单位|具体日期/开始与截止|相关配送经验要求/接手条件|私下付款文字；更多菜单','报名::P08::开放且有资格可报名；已报显示查看报名|联系::M02::创建/复用会话并附来源卡|管理需求::P09::仅发布者|分享::G02::仅发布者生成公开链接|举报/屏蔽::G01::对象和来源带入','公开开放|本人|已报名|已找到|关闭/到期|报价已更新|数量低于下限暂不可报|被屏蔽/无权限','getRequest,createConversation','V12-09,V12-10,V12-11,V12-12,ADD-01,ADD-02,ADD-03,ADD-04','主CTA不同时显示两颗同权重按钮；终态停止新报名，已有会话可读；精确集合点不默认公开。')
page('P08','报名/我能帮忙','详情内报名面板','D01报名','来源需求最新摘要/版本|可到时间、可接件数|相关承运商配送经验|提交报名','提交报名::M02::报名和会话成功后进入来源会话|补充经验::U02::保存后回报名草稿|先联系::M02::不冒充报名成功','可接部分|整线确认|临时补充司机|不足最低量|超剩余量|版本变化|资格不足|重复/失败','applyToRequest,createConversation','V12-10,V12-11,ADD-01,ADD-02,ADD-04','重试不重复报名；报名成功与消息失败分开；无法承接不伪造容量。')
page('P09','管理我的需求','D01管理模式，合并旧P07成功回执','本人详情、U04','当前状态/版本|剩余件数/人数|报名总数≠已联系/已找到|编辑、查看报名、分享、关闭/重开、复制|草稿删除','编辑::P03::带当前版本，关键变动通知|报名列表::P10::仅本人可看|改缺口::P09::版本检查，零缺口需确认已找到|关闭/已找到::G03::确认后终态，不代表费用结清|重开::P03::重新填有效期后校验|复制::P03::新草稿，原报名不搬走|删除草稿::G03::只隐藏本人未发布草稿，不删已发布历史|分享::G02::审核公开摘要','草稿|开放|有报名|缺口为0待确认|版本冲突|已找到/关闭/到期|重开','getRequest,updateRequestGap,closeRequest,reopenRequest,discardDraft','V12-11,V12-12,ADD-01,ADD-02','报名不自动减缺口；临时增人按本次缺口管理；公开期满不能静默续期。')
page('P10','报名司机列表','本人需求内列表','P09查看报名','每人：显示名、相关经验、本次可到时间/可接数量、报名版本、报名/撤回、已联系','看司机::D02::最小档案|联系::M02::来源会话|标已联系::P10::仅作本人管理，非到岗|返回::P09::保留列表位置','无报名|部分/整线/增人字段适配|已撤回|条件变化|加载失败','listRequestApplications,markApplicationContacted','V12-10,V12-11','他人不能访问；无到场确认、雇佣合同和结算状态。')
page('D02','司机档案','二级页，非DSP工作台','H03、报名列表、会话、常联系','显示名/自报或核验经验|熟悉区域/车型|当前可用时段/容量，有则显示|联系/常联系/更多','联系::M02::复用两人会话，检查双向屏蔽|常联系::U08::已有真实会话后可保存|举报/屏蔽::G01::当前人作为目标','可用|未声明/已到期|未在线但可用|经验未核验|被屏蔽|用户已注销','getDriver,createConversation,saveContact','V12-13,V12-14','无可用声明不应把整个档案变404；不公开真实GPS/手机号。')
page('M01','消息中心','二级列表，顶部分对话/通知','首页消息图标','对话列表：人名、时间、来源需求标题、未读；不预取正文|通知：报名/条件变更/终态/必要系统|总未读来自服务端','对话::M02::只标本会话已读水位|需求通知::D01::查看当前状态，发布者报名通知可到P10|贡献通知::H01::需重新查权限不把密码塞推送|设置::U11::通知偏好','对话|通知|空|未读|推送被禁但站内有记录|刷新失败','listConversations,listNotifications,getInboxSummary,readNotification','V12-15','进入中心不清空全部未读；无消息正文锁屏预览。')
page('M02','一对一会话','二级会话页，键盘避让','报名成功、联系、会话列表','对方显示名/最小组织来源|来源需求卡及所见版本|文字消息、发送状态|输入/发送|已共享集合点卡（明确授权后）|更多','发送::M02::client_message_id重试复用|需求卡::D01::当前版本详情，历史快照不覆盖|对方头像::D02::最小档案|分享集合点::M02::仅发布者明确分享给本会话|常联系/屏蔽::G01::本人操作|返回::M01::来自其他源则回源','正常|发送中|失败可重试|报价变动|需求已关闭|无新消息|双方屏蔽仅历史可读|共享撤回|断网','listMessages,sendMessage,readConversation,shareMeeting,getSharedMeeting,revokeMeetingShare','V12-15,V12-17','无支付、视频、语音、群聊；消息接受不显示成对方已读；已读水位不跨会话。')
page('C01','司机圈','底部导航根页','司机圈导航','文字互助动态|关联需求卡|基础回复数|发动态/发需求入口|同一三导航','动态::C02::查看及回复|需求卡::D01::同一个需求ID与状态|发文字::C03::首版仅文字|发需求::P01::统一发布','有内容|无内容|需求已结束|已屏蔽作者|加载失败','listPosts','V12-16','无虚构活跃人数、假头像墙、生活服务独立市场；不把原型备注当内容。')
page('C02','动态与回复','二级详情','C01、U04、通知','作者/时间|文字正文|可选关联需求|基础回复|输入/发送|更多菜单','发送回复::C02::提交成功才加列表，失败保留文本|作者::D02::最小档案|关联需求::D01::当前状态|举报/删除::G01::按作者/运营权限展示','正常|无回复|发送失败|动态已删除|回复被移除','getPost,listComments,createComment,removeComment','V12-16','不要求贴面单/门码；不复制支援条件形成另一套过期信息。')
page('C03','发布互助文字','二级编辑页','C01发文字','文本输入|可选关联本人已发布需求|发布按钮','发布::C02::成功进动态，不构造假互动|返回::G03::保存普通文字草稿或放弃','空|字数上限|发布中/失败|关联需求不可见','createPost,listMyRequests','V12-16','无多图上传、租房保险交易表单；页面不加品牌口号长说明。')
page('U01','我的','底部导航根页','我的导航','本人资料|可接活状态|我的发布/报名/贡献|常联系|组织来源|设置','资料::U02::修改本人|可接活::U03::声明时段与区域|我的发布::U04::需求/文字|我的报名::U05::当前与历史|我的贡献::U06::本人记录|常联系::U08::私人列表|组织来源::U10::最小来源|设置::U11::账户/通知/位置','未登录|正常|资格待核验|可用/到期|账号受限','getMe,getMyAvailability','V12-13,V12-20','没有钱包/收入/结算/配送数据；身份不触发另一端工作台。')
page('U02','资料与经验','二级编辑页','U01、报名补充','显示名、简短介绍|自报承运商经验/区域|车型|已有核验记录只读|保存','保存::U01::回实际来源，报名返回P08保留条件|返回::G03::普通草稿提示保留或放弃','普通|长名/空名错误|自报与核验分开|保存失败','patchMyProfile,getMe','V12-13','本人无法把source改verified；核验资料不被自报PATCH覆盖。')
page('U03','可接活设置','二级编辑页','U01/H03','可接活开关|开始/结束时段|可去区域|可接容量|最晚结束时间|保存','保存::U01::当前时段生效，回来源|关闭可接活::U03::停止找人推荐，不删除会话','未设置|已开启|时间错误|过期|容量为空|版本冲突','getMyAvailability,setMyAvailability,listRegions','V12-13,V12-14','切回承运商App仍按声明时段有效；不请求后台轨迹权限。')
page('U04','我的发布','二级列表，需求/动态分段','U01','需求：草稿/开放/终态、件数/本次人数缺口、更新时间|动态：正文摘要/状态','需求::P09::本人管理模式|动态::C02::本人更多有删除|草稿::P03::继续编辑','草稿|已发布|已结束|文字|空|失败','listMyRequests,listMyPosts','V12-12,V12-16','本人列表不能把草稿放进公开圈子；旧报名不搬到复制需求。')
page('U05','我的报名','二级列表','U01','配送区域/支援类型|本次到达时间/容量|报名版本/当前状态|撤回操作','需求::D01::当前条件|联系::M02::已有会话|撤回::G03::撤本人报名，不替发布者扣回缺口','已报名|撤回|条件变更|需求结束|空','listMyApplications,withdrawApplication','V12-10,V12-11','撤回不删除双方历史消息；未接受新价不显示已同意。')
page('U06','我的贡献','二级列表；元数据与正文分开','U01','所属公寓、创建/同码验证类型、时间|待审核/可用/失效/撤回|不默认加载密码正文','看公寓::H01::重新校验资格再读正文|撤回本人创建::G03::停止展示；同码验证者不能撤别人原记录|查看审核状态::U06::只读本人元数据','创建|同码验证|待审核|已失效|已撤回|资格过期仍可看本人元数据','listMyContributions,withdrawAccess','V12-07,V12-17','不能为看本人审核进度强制继续持有access.read；不从列表泄露失效正文。')
page('U08','常联系','二级私人列表','U01、D02、会话','显示名/相关经验|本人备注|会话入口|移除','联系::M02::已有会话；屏蔽则不可新发|档案::D02::最小资料|备注/移除::U08::只影响本人列表','有联系人|空|已屏蔽|用户注销|保存失败','listMyContacts,saveContact,deleteContact','V12-15','不导入微信通讯录、不让DSP其他人读取本人备注。')
page('U10','组织来源','本人资料内二级编辑','U01、发布需求来源','组织名称|本人具体联系人|自报/已核验状态只读|保存','保存::U01::仅维护本人有权代表的来源|返回::G03::未保存提示','未填|自报|已核验|保存失败','putMyOrganization,getMyOrganization','V12-09','无成员邀请、权限工作台；发布不冒用其他组织ID。')
page('U11','设置与账户','二级设置页，分组子面板','U01、消息','通知偏好|位置权限与系统设置入口|账号/手机号恢复入口|退出登录|删除账号|隐私/必要条款|不增加完整英文首发承诺','通知设置::U11::偏好只改推送，站内事件仍保留|位置设置::U11::仅按需打开OS设置，不索后台轨迹|退出::G03::解绑本设备并清敏感缓存|删除账号::G03::重新认证后提交删除任务，展示状态|返回::U01::保留原源','正常|推送拒绝|定位拒绝|退出失败|需重新认证|删除处理中/失败','getNotificationPreferences,setNotificationPreferences,unbindDevice,deleteMyAccount','V12-15,V12-17','删除不写成瞬时清空所有备份；不泄露OTP/refresh token。')
page('G01','更多/举报/屏蔽','公共操作面板','详情、会话、动态、本人记录','依对象权限显示：举报/屏蔽/常联系/本人删除撤回|举报原因|必要确认','举报::G01::提交对象/原因，回执不自动处罚|屏蔽::G03::双向限制新联系，保留必要历史|删除/撤回::G03::只按本人权限动作|常联系::U08::有会话才可保存','他人对象|本人对象|原因未填|提交失败|已屏蔽','submitReport,blockUser,unblockUser,saveContact,removePost,removeComment','V12-15,V12-17','不暴露举报人给被举报者，不做单方差评自动黑名单。')
page('G02','分享需求','公共分享面板，仅发布者','D01/P09本人分享','将公开的需求摘要|复制链接/系统分享|撤销链接|来源状态','生成/复制::G02::生成token并系统复制，用户自行发微信|系统分享::G02::调用OS分享，不保证存在微信专用按钮|预览::X01::看游客公开摘要|撤销::G03::立即使token不可用','未生成|可分享|公开字段待核对|生成失败|链接已撤销|需求已结束','createRequestShare,revokeRequestShare','ADD-05','不默认发朋友圈；无电话微信/精确集合点/报名名单/门码。')
page('X01','外部公开需求摘要','H5公开页，App深链/登录桥接','用户主动分享的token链接','Abasong标识|只读公开摘要|状态/有效期|打开App、报名/联系入口|未安装时分发入口','报名/联系::A02::保存token+意图，登录后查最新需求再进入D01/P08|打开App::D01::深链成功后仍查当前权限与状态','开放|已结束仅终态|token无效/撤销|登录回跳条件变化|未安装App','getPublicRequestShare','ADD-05','游客不访问完整Request接口；不能通过token读私聊、司机库或公寓码；首版不承诺H5完整报名工作端。')
page('G03','确认/错误/恢复','全局组件状态，不是独立路由','表单退出、撤回、关闭、删除、错误','明确对象与动作|必要结果说明|主动作/取消或重试','确认::G03::执行来源动作，成功返回来源状态|取消::G03::不改变业务|重试::G03::复用幂等意图，不清空输入','未保存退出|关闭需求|撤回记录/报名|删除草稿/动态|退出/删账号|服务错误/版本冲突','', 'V12-07,V12-11,V12-12,V12-15','不弹长段教学；危险操作用明确名称，非统一写确定；共享组件按来源完成回跳。')

# 2026-10-30 user-approved P0 screenshot contribution extension.
for p in pages:
 if p['id']=='H01':
  p['actions'].append(dict(label='从截图添加（展开层）',target='B04',result='保留返回意图；不把当前公寓套给整批截图'))
 if p['id']=='B02':
  p['actions'].append(dict(label='从截图添加',target='B04',result='改用单张或多张截图整理；未保存明文仍仅内存'))
 if p['id']=='U01':
  p['information'].insert(3,'贡献公寓资料')
  p['actions'].append(dict(label='贡献公寓资料',target='B04',result='直接进入系统选图与批量整理'))
 if p['id']=='U06':
  p['information'].append('本人导入批次的计数、状态和继续处理入口；不默认加载候选密码')
  p['actions'].extend([dict(label='从截图添加',target='B04',result='新增本人导入批次'),dict(label='继续导入',target='B06',result='恢复本人批次；候选正文重新鉴权')])
  p['states'].extend(['导入处理中','部分成功待继续'])
page('B04','截图导入','全屏二级页；三导航外','U01贡献公寓资料、U06、H01展开层或B02','返回|系统照片选择器|已选图/数量/移除/追加|逐图上传状态|识别截图','选择/追加截图::B04::仅用户选择照片，不要求全相册|移除误选::B04::移除本批未提交图片|识别截图::B06::创建本人批次并异步处理|返回::G03::取消或保留服务端加密批次，不保存明文本地草稿','空|有限照片授权|权限拒绝|已选图|不支持/损坏图|部分上传失败|上传中|账号或资格不可用','', 'ADD-06','单/多图无须逐条录地址；不读取其他APP账户，不自动公开原图或识别正文。')
page('B05','识别结果确认','二级页；行内编辑和候选面板复用','B06识别完成或待继续','可提交/待处理分组|每行地址、密码、匹配状态|歧义高亮与必要原图局部|来源与归属集中确认|确认提交N条','编辑或匹配::B05::仅修不确定项；地址/密码变更后重新确认|取消选择/移除::B05::未确认项不发布，不重跑整批|确认提交N条::B06::仅提交当前已确认选中项，逐项幂等|稍后继续::U06::加密本人草稿，返回时重新鉴权','可提交组|缺地址/无密码|多地址对应不明|符号歧义|同名多候选|公寓未收录|全重复|来源未确认|编辑后重确认|资格撤销','', 'ADD-06','不强制逐条打勾；不能把模型判断当用户确认。低置信不默认选入，同码不刷新贡献时间，OCR不产生有用票。')
page('B06','导入进度与结果','二级页；同批次状态与结果','B04启动、B05提交、U06继续','处理进度|已贡献/同码/待审核/待处理/失败计数|单项结果|继续确认或仅重试失败项|返回来源','继续确认::B05::恢复待确认项，保留已成功项|重试失败项::B06::不重复提交已成功记录|继续添加截图::B04::新批次或追加允许阶段，按服务端状态判定|返回我的贡献::U06::本人批次元数据|取消未完成::G03::回收未提交源资料，已发布记录按独立撤回规则','排队/识别中|部分识别失败|识别完成待确认|提交中|部分提交成功|全成功|待审核|失败可重试|已取消/过期|后台返回恢复','', 'ADD-06','上传/识别/提交/可展示分开；切后台不丢批次，重试不重建已成功项，取消后不得回写。')
for p in pages:
 if p['id'] in ['B04','B05','B06']:
  p['api_contract_status']='待T27扩展OpenAPI与生成器；尚无已冻结operationId'
  p['prototype_status']='待制作'

# 2026-10-30 approved personal-apartment library and explicit sharing.
for p in pages:
 if p['id']=='U01':
  p['information']=[x for x in p['information'] if x!='贡献公寓资料']
  p['information']=[x.replace('我的发布/报名/贡献','我的发布/报名/我的公寓') for x in p['information']]
  p['actions']=[x for x in p['actions'] if x['label']!='贡献公寓资料']
  for a in p['actions']:
   if a['label']=='我的贡献':a.update(label='我的公寓',target='U06',result='统一进入我保存的/我共享的及添加资料')
 if p['id']=='U06':
  p.update(name='我的公寓',surface='二级页；我保存的/我共享的分栏',entry='U01唯一入口、H01收藏、B06保存结果',information=['我保存的/我共享的','私人区域筛选与收藏公寓','共享贡献状态/时间及必要反馈汇总','截图添加/手动添加','本人导入批次与继续处理'],actions=[dict(label='打开保存的公寓',target='U09',result='私人记录和当前共享资料分开读取'),dict(label='截图添加',target='B04',result='默认仅自己保存，可显式同时共享'),dict(label='手动添加',target='U09',result='本人私存；未收录地址也可保存'),dict(label='纠正共享密码',target='U06',result='新增或合并正确记录，保留原事件/他人反馈'),dict(label='继续导入',target='B06',result='恢复本人批次并重校权限')],states=['未登录','我保存的','区域无结果','我共享的','无共享记录','资格过期仍可看本人元数据','导入处理中','部分成功待继续','共享纠正','统计暂无数据','撤回本人贡献','删除私存确认'])
  p['api_contract_status']='T27/T32–T35待扩展；现有贡献接口仅覆盖旧功能'
 if p['id']=='B05':
  p['information'][-2:]=['保存范围：仅自己保存（默认）/同时共享','核对资料与必要来源确认','保存N条或保存并共享N条']
  p['states']+=['仅自己保存','主动共享确认']
  for a in p['actions']:
   if a['label']=='确认提交N条':a.update(label='保存所选N条',result='分开记录私存与共享结果，首次提交后固定范围；重试不自动扩大共享')
 if p['id']=='B06':p['information'][1]='私存/共享/同码/待审核/待处理/失败独立计数'
 if p['id']=='H01':p['actions'].append(dict(label='收藏公寓',target='U09',result='保存公寓ID引用，不复制共享密码为永久快照'))
 if p['id'] in ['H01','U01','U06','B04','B05','B06']:p['requirements'].append('ADD-07')
page('U09','公寓详情与我的记录','二级页；私存与共享两个分区','U06保存公寓、H01收藏','地址与自定区域|我的记录：仅自己可见|共享资料：按当前资格读最新|添加/修改/删除私存|主动共享与地图入口','修改私存::U09::只改本人记录，不覆盖共享库|共享这条::U06::确认范围后复用正式贡献链路，私人备注不共享|设置区域::U09::维护本人区域标签|移除本人公寓::G03::确认私人范围，不删除公共记录|在地图查看::H01::选择该公寓后读当前资料','收藏无私存|有私人记录|共享资料可读|共享资格待审核|未收录公寓私存|编辑与删除|主动共享确认|私存/共享分别失败','', 'ADD-07','收藏关联公寓ID；本人私存和共享资格分离；不展示他人私存，修改私存不隐式修改共享。')
pages[-1]['api_contract_status']='T27/T32–T35待扩展私存/收藏/共享/纠正/统计接口'

# Latest contribution-first entry hierarchy; no extra route required.
for p in pages:
 if p['id'] in ('H01','U01','U06','B02','B04','B05'):
  p['requirements'].append('ADD-08')
 if p['id']=='H01':
  p['information']+=['无密码卡片直接添加；展开添加位于地址下方/历史上方','展开地址旁收藏图标；收起不显示收藏或我的公寓文字']
  p['states']+=['无共享密码直接添加','展开添加前置与收藏图标']
 if p['id']=='U01':
  p['information'].insert(0,'主要操作：贡献公寓密码；次级管理：我的公寓')
  p['actions'].insert(0,dict(label='贡献公寓密码',target='B04',result='选择截图识别或快速填写；填写复用B02并先核对公寓'))
 if p['id']=='U06':
  p['information']+=['卡片直显一条密码/门别及另有N条，标明私人或共享来源']
  p['states']+=['列表直读本人私存','收藏共享资格变化']
  for a in p['actions']:
   if a['label']=='截图添加':a.update(label='导入私存',result='仅自己保存预选；贡献入口另走明确共享')
 if p['id']=='B02':p['information']+=['已选公寓自动带入；通用填写先核对公寓','来源声明与确认共享按钮']
 if p['id']=='B04':p['information']+=['贡献/私存入口意图传递，未提交不自动公开']
 if p['id']=='B05':
  p['information']=[x.replace('保存范围：仅自己保存（默认）/同时共享','提交范围：共享贡献/仅自己保存，按入口预选') for x in p['information']]
  p['states']+=['贡献入口预选共享','私存入口预选私存','范围切换清除确认','资格不足不自动改私存']
  p['actions']=[{**a,'result':a['result'].replace('首次提交后固定范围','首次提交后固定入口确认范围')} for a in p['actions']]

# D1 source contract is present for manual/private library; OCR/corrections remain pending.
for p in pages:
 if p['id']=='U06':
  p['api_operations']=['listMyApartmentLibrary','getMyApartmentEntry','createMyApartmentEntry','createMyPrivateRecord','listMyContributions','readAccessRecords']
  p['api_contract_status']='私存/收藏与手动共享契约已生成；OCR批次、纠正和统计仍待扩展'
 if p['id']=='U09':
  p['api_operations']=['getMyApartmentEntry','patchMyApartmentEntry','deleteMyApartmentEntry','createMyPrivateRecord','patchMyPrivateRecord','deleteMyPrivateRecord','shareMyPrivateRecord','readAccessRecords']
  p['api_contract_status']='本人记录/收藏/主动共享契约已生成；未知公寓共享提议、纠正、统计仍待后续任务'

# 2026-10-30 approved unified home map controls and location recovery.
for p in pages:
 if p['id'] in ['H01','H02','H03']:
  p['information'].append('搜索右侧消息；可见地图右下定位，发需求位于定位上方；地图归属避让卡片')
  p['acceptance']+=' 三模式共享会话位置；同坐标拖图后可回位，卡片和工具栏通过camera padding避让；GPS失败、无收录与查询失败分别显示，拒绝权限可打开系统设置。'
 if p['id']=='H01':
  for a in p['actions']:
   if a['label']=='定位':a['result']='刷新本人位置并回到可见地图中心；保留阅读中的卡片，候选确认后再改变公寓'
 if p['id'] in ['H02','H03']:
  p['information'].append('模式栏右侧列表/地图切换；切换后保留筛选、选中项、视野和列表滚动')
  p['actions'].append(dict(label='回到我的位置',target=p['id'],result='独立定位，不被列表切换替代，不公开本人精确位置'))
 if p['id']=='U01':
  p['acceptance']+=' 设置只在页面底部菜单，不放顶部重复入口。'
 if p['id']=='M01':
  p['acceptance']+=' 首页搜索右侧为消息主入口，打开本二级页；我的顶部不重复放入口。'

outdir=ROOT/'docs/product'
outdir.mkdir(parents=True,exist_ok=True)
coverage_path=ROOT/'design/abasong-independent-v1/v12.1/coverage.json'
coverage=json.loads(coverage_path.read_text()) if coverage_path.exists() else {}
made={p['id'] for p in coverage.get('nodes',[])}
extension_path=ROOT/'design/abasong-independent-v1/v12.1-import/coverage.json'
extension=json.loads(extension_path.read_text()) if extension_path.exists() else {}
extension_made={p['id'] for p in extension.get('nodes',[])}
for p in pages:p['prototype_status']=('原型已认可·作为开发基线（状态部分覆盖）' if coverage.get('baseline_accepted_for_development') else '已制作本地交互·待用户验收（状态部分覆盖）') if p['id'] in made else '待制作'
for p in pages:
 if p['id'] in ['H01','B02','U01','U06']:
  p['prototype_status']='原节点基线已认可；截图扩展已制作待评审' if p['id'] in extension_made else '原节点基线已认可；截图新增入口/状态待制作'
  p['requirements'].append('ADD-06')
  p['pending_extension']='截图导入相关接口待T27扩展；现有api_operations仅覆盖原功能'
for p in pages:
 if p['id'] in ['B04','B05','B06','U09'] and p['id'] in extension_made:
  p['prototype_status']='已制作本地合成交互·待用户评审；非真实OCR'
# Current on-device batch API implementation; cloud OCR/upload remains planned.
for p in pages:
 if p['id']=='B04':
  p['api_operations']=['getImportPolicy','listImportBatches','createImportBatch','getImportBatch','registerImportLocalSource','submitImportDeviceExtraction']
  p['information']=[x.replace('逐图上传状态','逐图识别与草稿状态') for x in p['information']]
  p['states']=[x.replace('部分上传失败','部分识别失败').replace('上传中','识别中') for x in p['states']]
  for a in p['actions']:
   if a['label']=='识别截图':a['result']='端侧识别；主动保存草稿或提交时登记本人加密批次'
 if p['id']=='B05':
  p['api_operations']=['listImportCandidates','editImportCandidate','confirmImportCandidate','confirmImportSelection','editImportBatchMode','deleteImportDraft']
 if p['id']=='B06':
  p['api_operations']=['getImportBatch','listImportSources','commitImportCandidates','cancelImportBatch']
 if p['id'] in ['B04','B05','B06']:
  p['api_contract_status']='15个端侧批次接口已实现并经本地HTTP/数据库验证；云端上传/识别3操作仍planned，真机与完整状态验收未完成'
 if p['id'] in ['H01','B02','U01','U06']:
  p['pending_extension']='端侧识别+加密草稿/确认/两阶段批次已接入；真实来源样本、完整原生异常/真机、云识别与贡献统计仍待验收或开发'
# LA expansion + weak-network recovery acceptance slice.
for p in pages:
 if p['id']=='H01':
  p['acceptance']+=' 精度圆触及相邻建筑或无边界地址点时不自动认栋；配置版本变化重新计停留；地址-only样本不伪造建筑轮廓。'
 if p['id']=='B04':
  p['states']+=['草稿加载超时可重试','来源已登记但无已保存识别结果']
  p['actions'].append(dict(label='重试加载草稿',target='B04',result='仅重读本人未完成批次元数据；恢复网络后继续'))
  p['acceptance']+=' 无已保存候选时返回选图页，用户重新选图后明确开始新批次，旧批次按TTL保留；不声称原图或未保存OCR可恢复。'
 if p['id']=='B05':
  p['states']+=['修改响应丢失后幂等恢复','原公寓已不可用','异端编辑冲突']
  p['acceptance']+=' 修改和模式切换丢失响应先复用原键/原体；不吸收异端修改；旧公寓404可恢复其他候选，401/503仍报错可重试。'
 if p['id']=='B06':
  p['states']+=['提交完成但响应丢失']
  p['acceptance']+=' 复用逐项稳定提交ID恢复结果，不重复私存；超时和退出取消分别处理，不自动重试写入。'
# 2026-10-31 interrupted on-device recognition and atomic draft restoration.
for p in pages:
 if p['id']=='B04':
  p['states']+=['识别中可停止','多图暂停后继续剩余图片','单图超时仍等待原生任务结束']
  p['information'].append('逐图已处理/总数进度；识别中显示停止识别')
  p['actions'].append(dict(label='停止识别',target='B05',result='立即停止等待与后续图片，保留已完成图片结果；没有结果则留在选图页'))
  p['acceptance']+=' 原生任务未结束前不并发发起新识别，迟到结果不得覆盖当前结果；不把停止等待说成系统OCR已硬终止。'
 if p['id']=='B05':
  p['states']+=['移除最后一条后保存空草稿']
  p['actions'].append(dict(label='继续处理剩余截图',target='B05',result='仅处理未完成图片，不重跑已识别或人工补充的图片；已提交范围锁定时显式转新草稿，旧结果保留'))
  p['acceptance']+=' 已有且未锁定草稿可保存全部移除，首次无内容不创建空批次；失败图片可单图重试。'
 if p['id']=='B06':
  p['states']+=['恢复分页失败保留当前批次']
  p['acceptance']+=' 新批次元数据与全部候选读取完成前，不替换当前草稿和重试状态。'
(outdir/'V12.1_页面与状态目录.json').write_text(json.dumps({'version':'V12.1','date':'2026-10-31','note':f'{len(pages)}设计节点含截图扩展；{sum(len(p["states"]) for p in pages)}状态待逐项验证。原认可原型为36节点/207状态历史范围；B04/B05/B06合成交互与原生业务证据分开；端侧批次15接口已实现，云识别3接口仍规划','pages':pages},ensure_ascii=False,indent=2)+'\n')
with (outdir/'V12.1_页面制作清单.csv').open('w',encoding='utf-8-sig',newline='') as f:
 fields=['id','name','surface','batch','state_count','api_operations','status']
 w=csv.DictWriter(f,fieldnames=fields,lineterminator="\n");w.writeheader()
 for p in pages:
  batch='01-公寓闭环' if p['id'] in ['A02','A03','A04','H01','S01','L01','B01','B02','B04','B05','B06','U06','U09','G01','G03'] else '02-找人找活' if p['id'] in ['H02','H03','P01','P03','P04','D01','P08','P09','P10','D02','U03','G02','X01'] else '03-消息与常联系' if p['id'] in ['M01','M02','U08'] else '04-社区与我的'
  w.writerow(dict(id=p['id'],name=p['name'],surface=p['surface'],batch=batch,state_count=len(p['states']),api_operations=','.join(p['api_operations']),status=p['prototype_status']))
lines=['# Abasong V12.1 页面功能、信息与交互规格','', '日期：2026-10-31。状态：含截图P0扩展；端侧15接口与部分原生流程已有验证，新增长任务/恢复状态仍待逐项原生验收，云上传/OCR3接口仍规划。产品依据：[V12 PRD](../../Abasong_PRD_V12_首版产品需求.md)及[V12.1补充决策](../Abasong_V12.1_需求补充与原型决策.md)。颜色/组件依据：[V3设计系统](../design/Abasong_设计系统_V3_原型制作基线.md)。', '', '## 1. 全局规则','', '产品只做临时配送支援与灵活运力协作，不设置长期招聘/司机招募流程。根导航固定首页/司机圈/我的；公寓/找活/找人为同一首页路由的状态。二级页面和公共面板可暂时隐藏导航，返回恢复来源视图、选中对象、筛选与滚动。登录后回到发起动作前的对象，但重新读取当前条件，不自动提交过期报名。', '', '每个界面只保留必要信息和一项当前主动作；空/错误/审核/来源/地图归属属于必要状态，设计说明、策略备注、合成数据说明留在原型外壳，不能成为产品首页常驻文案。', '', '普通草稿可保留；手动密码/进入信息明文只在编辑会话内存保留，不写通用持久草稿。截图批次另采用本人专属、有限保留的服务端加密草稿，详见[截图补充](Abasong_V12.1_截图批量贡献需求补充.md)。用户切账号、退出或资格被撤销后清理敏感缓存。需求、私聊、进入资料各自鉴权，不因显示同一地图就共享访问权。', '', '菜单按对象权限显示：发布者管理自己的需求，报名者管理自己的报名；司机与DSP不切换客户端或导航。当前没有支付、交接履约、司机排名、会员密码付费墙。', '', '原型使用合成资料和模拟请求；每个状态应可在原型外的场景控制中触发。开发说明/测试开关不出现在产品画面。', '', '## 2. 页面总览','', '| ID | 名称 | 载体 | 状态数 |','|---|---|---|---|']
for p in pages: lines.append(f"| {p['id']} | {p['name']} | {p['surface']} | {len(p['states'])} |")
lines+=['','## 3. 逐页规格','']
for p in pages:
 lines += [f"### {p['id']} · {p['name']}",'',f"**载体与入口：** {p['surface']}；{p['entry']}。",'', '**信息顺序：**','']+[f'{i}. {s}' for i,s in enumerate(p['information'],1)]
 lines+=['','| 元素/动作 | 目标 | 操作结果 |','|---|---|---|']+[f"| {a['label']} | {a['target']} | {a['result']} |" for a in p['actions']]
 lines+=['', '**必须制作的状态：** '+'；'.join(p['states'])+'。','', '**接口 operationId：** '+(p['api_contract_status'] if p.get('api_contract_status') else '、'.join(p['api_operations']) if p['api_operations'] else 'Auth SDK或纯客户端/来源动作；不新建无业务价值的接口')+'。', '', '**验收：** '+p['acceptance'], '', '**需求映射：** '+ '、'.join(p['requirements'])+'。','']
 if p.get('pending_extension'): lines += ['**截图扩展：** '+p['pending_extension'],'']
lines+=['## 4. 制作与变更规则','', '本次40个节点包含B04/B05/B06及重新定义的公寓U09；原36节点原型保留历史，不等于40条原生独立路由，也不是所有状态各复制一页。原有V1.1的B03/P02/P06/P07/C05/M03/U07/U12–U14在本版合并；C04生活专用表单/非公寓综合收藏/完整组织成员管理继续后置；U09仅做公寓私存工具。', '', '每个动作目标必须能到达，空白按钮不得伪装完成。接口由openapi-v12.yaml提供，operationId在目录中可机器检查；该文件保留名称，版本升为12.1。新增功能需更新补充决策→页面目录→接口/数据→原型与验收，不在画稿时临时加业务。', '', '后续先做公寓完整闭环，再做找人找活/分享，再做消息与常联系，最后补最小社区/我的；所有批次遵循同一套品牌和组件，不把多个历史版本混在同一原型。']
(outdir/'Abasong_V12.1_页面功能信息与交互规格.md').write_text('\n'.join(lines)+'\n')
print(f'{len(pages)} design nodes; {sum(len(p["states"]) for p in pages)} required state variants')
