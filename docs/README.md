# Abasong 研发文档入口

更新2026-11-05。**新版原型主要体验已获产品认可，已完成实际源码与目标差异复核；R4-01/02已完成本批实现及双端代表状态核对；R4-03统一贡献表单与地址联想已完成本批实现及双端核对，R4-04独立滑卡/区域查询/相机记忆已实现，已完成本批双端核心核对，R4-05组合修正及iOS核心核对已执行，Android部分状态已核对，手动项及阶段出口仍待。** 实际App沿用V3.1基础，R4距离及公寓组件已局部接入V3.2目标；39活动节点/387状态未全验，真实观察仍0/7。R4本地实现就绪与B5/发布就绪分开。

本轮先看：[App对齐审查与开发任务](technical/V3.2_App对齐审查与开发任务.md)、[22个工作包CSV](technical/V3.2_App对齐开发任务清单.csv)、[总计划1.32](Abasong_V12.1_项目开发与验收总计划.md)、[机器状态](product/V3.2_开发基准状态.json)。源码审查起点df82aef；当前实现基于PR89。本批R4-03工程lint/类型/380测试/包及API-worker构建通过，本地隔离HTTP/PG295项（含附近覆盖97项）通过；双端代表场景已核对，失败/重试/无资格和最终视觉状态已补齐；R4-01/02旧批次远程CI通过；R4-03最新HEAD查看[PR91 Checks](https://github.com/olly888/abasong/pull/91/checks)，非现场验收。普通常联系取消、公寓列表P1、专用求助P04后置。

原型入口：[首页](../design/abasong-independent-v1/v12.1-experience/index.html?v=r3-delivery#home)、[两场景发布](../design/abasong-independent-v1/v12.1-experience/index.html?v=r3-delivery&task=delivery)、[我的](../design/abasong-independent-v1/v12.1-experience/index.html?v=r3-delivery&task=me)。产品确认只覆盖主要体验，原型图不代表App已更新。当前和目标依据[可开发基准](Abasong_V3.2_可开发与可验收基线.md)；之前全文保留在[审查前档案](archive/app-alignment-audit-20261105/README.md)。

## 当前入口

- [R4-05首页组合验收](technical/R4_05_首页组合流程与阶段验收.md)：按模式定位、返回阅读、迟到保护及Android原生轨道布局修正；工程390项、公寓HTTP/PG295项、协作HTTP/PG261项通过。Android手动组合反馈仍待，不标阶段出口通过。

- [R4-04找活找人滑卡／区域／相机](technical/R4_04_找活找人滑卡区域与相机验收.md)：共用卡轨道及内容、真实区域查询和视角记忆；全工程387项及隔离HTTP/PG261项通过；Android核心与iOS手动视角补验均通过，[PR92精确HEAD检查](https://github.com/olly888/abasong/pull/92/checks)，R4-05整批出口仍待。

- [R4-03统一贡献表单与地址联想](technical/R4_03_统一贡献表单实施验收.md)：同一表单、候选会话/换址保护及失败重试；Android两组用户补验通过，双端合成证据与真实接口证据分别记录。

- [R4-01距离契约与公寓卡片](technical/R4_01_距离契约与公寓卡片实施验收.md)：实际代码、双端代表场景、自动检查及未验项。

- [产品基线](../产品基线.md)：当前范围和不可退化规则。
- [产品、设计与技术升级总览](Abasong_V12.1_产品设计技术升级总览.md)：本轮统一裁决、角色结论及版本分工。
- [工程状态](../DEVELOPMENT_STATUS.md)、[项目总计划](Abasong_V12.1_项目开发与验收总计划.md)、[完整功能与集中验收](product/Abasong_V12.1_完整功能开发与集中验收计划.md)：实际进度、近期顺序和阶段门槛。

## 产品与原型

- [产品体验升级与需求收敛](product/Abasong_V12.1_产品体验升级与需求收敛方案.md)：目标优先级、日期/区域/数量含义、UX01–10。
- [页面功能与交互规格](product/Abasong_V12.1_页面功能信息与交互规格.md)、[当前39活动节点目录](product/V12.1_页面与状态目录.json)、[制作清单](product/V12.1_页面制作清单.csv)。
- [V3.2新版原型](../design/abasong-independent-v1/v12.1-experience/index.html)、[说明](../design/abasong-independent-v1/v12.1-experience/README.md)、[R2a实际检查](../design/abasong-independent-v1/v12.1-experience/验收记录.md)：核心地图/滑卡/找活找人/仓库流程可体验，34项浏览器检查通过，主流程已获产品认可；App未改。
- [旧版参考v12.1-import](../design/abasong-independent-v1/v12.1-import/index.html)、[说明](../design/abasong-independent-v1/v12.1-import/README.md)、[历史验收](../design/abasong-independent-v1/v12.1-import/验收记录.md)：合成交互，不能证明真实接口与权限。
- [新版原型制作与验收方案](product/Abasong_V12.1_原型升级制作与验收方案.md)：原型主流程已获产品认可；R2b/R2c未覆盖状态继续单列。
- [三模式卡片与距离补充](product/Abasong_V3.2_地图卡片与距离体验补充.md)：UP12/UX10；地址分级、同源近似距离、共用外框与横滑、筛选/选择分离，原型已改、App公寓组件已进入R4实现，协作组件已按R4-04实现，组合出口待R4-05。
- [仓库取件地址与导航补充](product/Abasong_V12.1_仓库取件地址与导航补充.md)：本轮DashLink截图借鉴，UP11/UX09原型目标；不恢复独立集合点或候补。
- [截图贡献需求](product/Abasong_V12.1_截图批量贡献需求补充.md)、[附近滑卡补充](product/Abasong_V12.1_附近公寓滑卡补充.md)、[我的公寓](product/Abasong_V12.1_我的公寓与私存共享补充.md)。旧细节服从最新产品基线。
- [V12基础PRD](../Abasong_PRD_V12_首版产品需求.md)、[V12.1补充](Abasong_V12.1_需求补充与原型决策.md)。

## 设计与文案

- **现行基础及组件：**[设计系统V3.1](design/Abasong_设计系统_V3.1_现行规范.md)、[令牌JSON](design/tokens-v3.json)；[逐页核对/未测记录](design/D2_设计系统收敛与逐页核对.md)。
- **目标原型：**[V3.2升级方案](design/Abasong_设计系统_V3.2_升级方案.md)、[文案与状态V1](design/Abasong_界面文案与状态规范_V1.md)、[升级追踪JSON](design/experience-upgrade-matrix.json)。启用范围以[R4报告](technical/R4_01_距离契约与公寓卡片实施验收.md)记录，不声明全App已迁移。
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
