# Abasong V12 研发文档入口

更新：2026-10-29。用户批准的产品需求已形成基线；本目录补齐实施设计。文档已编写不代表代码已实现、数据库已应用或服务已上线。

当前原型已获用户体验认可，可以进入正式工程开发；[Codex开发准备与执行方案](technical/V12.1_Codex正式开发准备与执行方案.md)记录实测环境和D0启动项。

## 工程状态

[D0实际验证记录](technical/D0_工程验证记录.md)、[工程状态](../DEVELOPMENT_STATUS.md)、[本地启动](../README.md)、[依赖锁定](../dependency-lock.md)。已有本地工程与数据库执行证据，原生地图及双平台验收限制见记录。

当前身份/账号验证见[接口记录](technical/D1_身份与账号接口验证.md)，原生接入与待验收项见[登录记录](technical/D1_原生登录接入记录.md)。

## 产品与页面

- [PRD V12](../Abasong_PRD_V12_首版产品需求.md)
- [首版页面范围与原型验收](../Abasong_V12_页面范围与原型验收.md)
- [V12.1需求补充与原型决策](Abasong_V12.1_需求补充与原型决策.md)：最新边界，只做临时配送支援与灵活运力协作，不做长期招聘/司机招募。
- [V12.1逐页功能信息与交互规格](product/Abasong_V12.1_页面功能信息与交互规格.md)、[机器目录](product/V12.1_页面与状态目录.json)、[制作清单](product/V12.1_页面制作清单.csv)。
- [P0截图批量贡献补充](product/Abasong_V12.1_截图批量贡献需求补充.md)：2026-10-30新增截图范围；当前含私人库共40节点/259状态，新B04/B05/B06本地合成交互已制作待评审，OCR/接口/增量迁移待实现。
- [原型制作与验收计划](product/Abasong_V12.1_原型制作与验收计划.md)。

## 技术交付

1. [技术架构与开发基线](technical/V12_技术架构与开发基线.md)
2. [数据库设计与事务规则](technical/V12_数据库设计与事务规则.md)
3. [SQL 初始迁移](../database/migrations/0001_v12_initial.sql)
4. [API 契约与权限规则](technical/V12_API契约与权限规则.md)
5. [OpenAPI 机器契约](technical/openapi-v12.yaml)
6. [开发顺序与验证计划](technical/V12_开发顺序与验证计划.md)
7. [静态校验结果](technical/V12_静态校验结果.json)
8. [地图选型与现场验证](../research/2026-10-29_地图服务商选型_Mapbox与公寓识别.md)
9. [V12.1页面与技术契约对齐](technical/V12.1_页面梳理与契约对齐.md)：接口文件保留原名，版本升为12.1.0；未应用的初始SQL草案已同步。

## 设计交付

- [截图贡献扩展原型](../design/abasong-independent-v1/v12.1-import/index.html)、[使用与限制](../design/abasong-independent-v1/v12.1-import/README.md)、[实际检查](../design/abasong-independent-v1/v12.1-import/验收记录.md)：新增合成流程待用户评审，原认可版本保留。

- [当前V12.1交互原型入口](../design/abasong-independent-v1/v12.1/index.html)、[使用说明](../design/abasong-independent-v1/v12.1/README.md)、[验收记录](../design/abasong-independent-v1/v12.1/验收记录.md)：本地合成模型可操作，待用户评审；未连接真实服务，207种规格状态尚未逐项通过。
- [现有视觉基础 V2](../design/abasong-independent-v1/Abasong_国际化视觉与设计系统_V2.md)：现有令牌与原型基础。
- [品牌与交互 V3 顾问建议](design/Abasong_品牌与交互策略_V3_顾问建议.md)：自主皇家蓝方向已获同意，旧原型未覆盖。
- [设计系统V3·原型制作基线](design/Abasong_设计系统_V3_原型制作基线.md)、[V3令牌JSON](design/tokens-v3.json)、[CSS](design/tokens-v3.css)：用于新版原型和组件；不是原生组件库已开发。
- [配色对照](../design/abasong-independent-v1/brand-v3-comparison.html)：同一布局下切换黑白/皇家蓝，仅是设计方案。

## 版本规则

产品规则以PRD V12与V12.1补充及用户最新边界为准；技术文件实现这些规则，不新增履约/结算或长期招聘。V9技术草案和旧Jira清单不再作为开发来源。新版原型使用独立V3令牌，V2旧原型保留历史不作为已经升级完成。

当前先完成页面规格与原型验收，再按闭环启动业务实现；纯技术兼容/迁移验证可并行。后续实现顺序：公寓查询/贡献/反馈 → 发布/报名/消息 → 可用司机/常联系/最小社区 → 真机与真实线路试点。

- [我的公寓与私存共享补充](product/Abasong_V12.1_我的公寓与私存共享补充.md)：U06/U09、默认私存、主动共享、贡献效果及纠正，T32–T35。
- [私人库与导入实施设计](technical/V12.1_私人库与导入实施设计.md)：接口职责、数据隔离与事务方案；不是已发布接口。

## 贡献入口优先（最新调整）

贡献共享为主要操作，私人库为管理工具；U01突出贡献，H01空卡直接添加、展开添加置顶、收藏图标收进详情；U06卡片直显本人私存或最新有权共享密码。B04/B05按入口预选shared/private，显式范围选择、来源声明，首次提交后锁定，资格不足不自动变更意图。详见[ADD-08](product/Abasong_V12.1_我的公寓与私存共享补充.md)。覆盖较早的统一默认私存描述，实际服务待实现。
