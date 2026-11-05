# Abasong 研发文档入口

已制作合成原型：[邀请司机](product/Abasong_V3.2_邀请司机功能方案.md)。入口位置、价值文案、通用二维码图/分享链接、接收介绍和分发边界已整理；[邀请页](../design/abasong-independent-v1/v12.1-experience/index.html?v=r3-invite&task=invite)、[接收页](../design/abasong-independent-v1/v12.1-experience/index.html?v=r3-invite&task=invite-receive)，20项浏览器检查及112项回归通过，待体验确认；实际App/分发未改。

我的与团队已批准目标：[规则](product/Abasong_V3.2_我的与团队资料补充.md)、[原型](../design/abasong-independent-v1/v12.1-experience/index.html?v=r3-simple&task=me)、[20项账户合成报告](../design/abasong-independent-v1/v12.1-experience/account-checks.json)。统一账号、接活开关上移、联系方式自愿；首版无常联系/收费/成员管理；实际App/服务待B5。原评审保留历史语境。

司机圈新增已批准目标：[首版图片发布](product/Abasong_V3.2_司机圈图片发布补充.md)、[定位与最小社区](product/Abasong_V3.2_司机圈定位与最小社区补充.md)、[C01–03原型](../design/abasong-independent-v1/v12.1-experience/index.html?v=r3-images&task=circle)。原生仍未开放，D15/D16/D17排B5；合成原型不是业务上线。

## 本轮先看：进入B5之前

[可开发与可验收基线](Abasong_V3.2_可开发与可验收基线.md)统一六步和门槛：[竞品证据](research/Abasong_竞品与替代方案证据表_2026-11-05.md) → [需求缺口](product/V3.2_首版需求缺口与范围裁决.md) → [五核心原型](../design/abasong-independent-v1/v12.1-experience/review.html) → [5司机/2DSP任务包](usability/V3.2_五司机两DSP可用性测试包.md) → [源码差异与分批](technical/V3.2_原型到代码差异与实施批次.md)。真实观察0/7，准备不等于通过；App未改、B5未启。旧工程状态和总计划全文移到[历史档案](archive/development-gate-20261105/README.md)。

更新2026-11-05。产品/设计/技术已收敛，R2a核心原型已制作待用户确认，再按差异恢复实际代码批次。文档已写、原型可操作、服务已实现、原生观察及现场验收是不同状态。

## 当前入口

- [产品基线](../产品基线.md)：当前范围和不可退化规则。
- [产品、设计与技术升级总览](Abasong_V12.1_产品设计技术升级总览.md)：本轮统一裁决、角色结论及版本分工。
- [工程状态](../DEVELOPMENT_STATUS.md)、[项目总计划](Abasong_V12.1_项目开发与验收总计划.md)、[完整功能与集中验收](product/Abasong_V12.1_完整功能开发与集中验收计划.md)：实际进度、近期顺序和阶段门槛。

## 产品与原型

- [产品体验升级与需求收敛](product/Abasong_V12.1_产品体验升级与需求收敛方案.md)：目标优先级、日期/区域/数量含义、UX01–10。
- [页面功能与交互规格](product/Abasong_V12.1_页面功能信息与交互规格.md)、[当前40活动节点目录](product/V12.1_页面与状态目录.json)、[制作清单](product/V12.1_页面制作清单.csv)。
- [V3.2新版原型](../design/abasong-independent-v1/v12.1-experience/index.html)、[说明](../design/abasong-independent-v1/v12.1-experience/README.md)、[R2a实际检查](../design/abasong-independent-v1/v12.1-experience/验收记录.md)：核心地图/滑卡/找活找人/仓库流程可体验，34项浏览器检查通过，待用户确认；App未改。
- [旧版参考v12.1-import](../design/abasong-independent-v1/v12.1-import/index.html)、[说明](../design/abasong-independent-v1/v12.1-import/README.md)、[历史验收](../design/abasong-independent-v1/v12.1-import/验收记录.md)：合成交互，不能证明真实接口与权限。
- [新版原型制作与验收方案](product/Abasong_V12.1_原型升级制作与验收方案.md)：R2a核心已制作待确认；R2b/R2c未覆盖状态继续单列。
- [三模式卡片与距离补充](product/Abasong_V3.2_地图卡片与距离体验补充.md)：UP12/UX10；地址分级、同源近似距离、共用外框与横滑、筛选/选择分离，原型已改、App待R4。
- [仓库取件地址与导航补充](product/Abasong_V12.1_仓库取件地址与导航补充.md)：本轮DashLink截图借鉴，UP11/UX09原型目标；不恢复独立集合点或候补。
- [截图贡献需求](product/Abasong_V12.1_截图批量贡献需求补充.md)、[附近滑卡补充](product/Abasong_V12.1_附近公寓滑卡补充.md)、[我的公寓](product/Abasong_V12.1_我的公寓与私存共享补充.md)。旧细节服从最新产品基线。
- [V12基础PRD](../Abasong_PRD_V12_首版产品需求.md)、[V12.1补充](Abasong_V12.1_需求补充与原型决策.md)。

## 设计与文案

- **现行App：**[设计系统V3.1](design/Abasong_设计系统_V3.1_现行规范.md)、[令牌JSON](design/tokens-v3.json)；[逐页核对/未测记录](design/D2_设计系统收敛与逐页核对.md)。
- **目标原型：**[V3.2升级方案](design/Abasong_设计系统_V3.2_升级方案.md)、[文案与状态V1](design/Abasong_界面文案与状态规范_V1.md)、[升级追踪JSON](design/experience-upgrade-matrix.json)。未启用到App，不存在两个同时现行的设计版本。
- [UI样板证据](design/D2_UI样板对齐实施与验收.md)、[iOS框架评估](design/D2_UI对齐审查与iOS原生方案评估.md)。保持RN/Expo，局部系统原生控件，不全面改写SwiftUI。

## 技术与实现

1. [现行技术架构](technical/V12_技术架构与开发基线.md)、[目标地图协作增量](technical/V12.1_地图协作架构增量方案.md)。
2. [数据库设计规则](technical/V12_数据库设计与事务规则.md)、[已应用迁移目录](../database/migrations/0001_v12_initial.sql)。不原地改已应用迁移；D0与云版本不同。
3. [API与权限规则](technical/V12_API契约与权限规则.md)、[OpenAPI](technical/openapi-v12.yaml)、[生成源](../scripts/generate_v12_openapi.py)。目标增量不是已发布契约。
4. [本地运行](../README.md)、[依赖锁定](../dependency-lock.md)、[工程验证方法](technical/V12_开发顺序与验证计划.md)。
5. [B4可用司机与地图发现](technical/D2_可用司机与地图找活找人实现.md)、[B3消息](technical/D2_消息发送与统一消息中心实现.md)、[B3通知](technical/D2_通知设置与系统推送实现.md)、[B2报名协作](technical/D2_报名来源会话与需求管理实现.md)。
6. [真实Mapbox与排序](technical/A3_真实Mapbox链路与附近排序稳定性验收.md)、[新地址保存](technical/A3_新地址永久保存与贡献闭环验收.md)、[原生新地址补验](technical/D1_未收录公寓原生补验.md)。
7. [云运行层](technical/A4_运行身份与服务凭据实施验收.md)、[云业务待验](technical/A4_云业务配置与双账号验收.md)、[内测配置](technical/A4_A5_独立内测配置与限期资格验收.md)。真实账号、业务KMS、远程推送和现场集中B6，不标阶段通过。

## 研究及历史

[DoorDash司机端深度研究](research/DoorDash_司机端深度研究与Abasong借鉴方案_2026-11-04.md)依据用户截图和官方来源，研究不等于功能批准或已实现。公开公寓样本是验收题库，不是全城市地址库。

[升级前文档入口快照](archive/experience-upgrade-20261104/研发入口_升级前快照.md)保留旧索引；其他专项历史报告保留原路径。若正文写“最新”但日期/批次更早，以本入口、产品基线和工程状态解释，不从历史追加段落推导现行版本。
