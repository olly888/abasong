# Abasong 研发文档入口

更新2026-11-04。当前先完成产品/设计/技术收敛与新版原型，再按差异恢复代码批次。文档已写、原型可操作、服务已实现、原生观察及现场验收是不同状态。

## 当前入口

- [产品基线](../产品基线.md)：当前范围和不可退化规则。
- [产品、设计与技术升级总览](Abasong_V12.1_产品设计技术升级总览.md)：本轮统一裁决、角色结论及版本分工。
- [工程状态](../DEVELOPMENT_STATUS.md)、[项目总计划](Abasong_V12.1_项目开发与验收总计划.md)、[完整功能与集中验收](product/Abasong_V12.1_完整功能开发与集中验收计划.md)：实际进度、近期顺序和阶段门槛。

## 产品与原型

- [产品体验升级与需求收敛](product/Abasong_V12.1_产品体验升级与需求收敛方案.md)：目标优先级、日期/区域/数量含义、UX01–08。
- [页面功能与交互规格](product/Abasong_V12.1_页面功能信息与交互规格.md)、[现行39节点目录](product/V12.1_页面与状态目录.json)、[制作清单](product/V12.1_页面制作清单.csv)。
- [当前原型v12.1-import](../design/abasong-independent-v1/v12.1-import/index.html)、[说明](../design/abasong-independent-v1/v12.1-import/README.md)、[历史验收](../design/abasong-independent-v1/v12.1-import/验收记录.md)：合成交互，不能证明真实接口与权限。
- [新版原型制作与验收方案](product/Abasong_V12.1_原型升级制作与验收方案.md)：R2地图→填写恢复→共用状态；尚未制作。
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
