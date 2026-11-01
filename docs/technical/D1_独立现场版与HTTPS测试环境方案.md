# D1：独立现场版与 HTTPS 测试环境

2026-11-01。对应 T23 / D1.6，落实用户“iPhone 离开 Mac 局域网后也能使用”的现场准备要求。现场样本仍为 Woodside Village，2547 Temple Ave。本文区分本批入口核对工具与后续完整业务测试环境；不改变首页自动查码产品规则。

## 1. 交付顺序

| 步骤                 | 手机可做什么                                                        | 依赖与验收边界                                                                                                   |
| -------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A：独立入口核对版    | 直接启动、查看公开 G1/G2、查看真实前台蓝点、回到当前位置            | Release 内置页面与公开几何；不连接 Mac API/Metro，不需登录；地图底图仍需要互联网。只核对公开入口，不提供共享密码 |
| B：完整 HTTPS 测试版 | 手机登录后通过真实 API 自动匹配公寓、读取授权 TEST 资料、贡献与反馈 | 固定 HTTPS API、云端业务库、KMS 适配、范围授权及撤销；独立 Release 安装。必须另行执行并验收，不能由 A 推定完成   |
| C：Woodside 现场闭环 | 移动不提前出卡、门外停稳出对应卡片、建筑与门牌一致、离开撤下        | 用户核对 G1/G2 身份与服务范围后确定版本化到达区域，限定启用；Android 真机另验                                    |

A 使用独立标识 `com.abasong.fieldreview`，桌面名称“Abasong入口核对”。原 Abasong 开发版保留。它是临时验收工具，不是新增的司机端页面或第四个导航，也不把公共主地址作为全部建筑的门牌。

## 2. 本批实施与数据

- `apps/mobile/src/field/entry.tsx` 为独立 Release 入口，不加载普通路由、AuthProvider 或业务 API 客户端。`package.json` 的普通入口保持不变。
- `apps/mobile/app.config.ts` 只在 `ABASONG_BUILD_PROFILE=field-review` 时使用独立 scheme / bundle ID；禁用该版本的明文与局域网传输例外。
- `scripts/field/build-ios.mjs` 使用现有签名和已锁依赖构建。检查内置 `main.jsbundle`、模块来源、应用身份与签名；构建结束恢复普通生成工程配置。不自动部署云端。
- `woodside.public.json` 由 `scripts/field/build-review-data.mjs` 从已有 ODbL 数据生成：54 个公开建筑轮廓与两个候选入口。几何与许可来源通过漂移检查，G1/G2 的 `field_verified` 始终为 false。没有真实门禁、包裹或用户轨迹。
- 复用已有前台定位流，后台停止监听，不建立位置存储或向 Abasong 业务 API 上报 GPS；Mapbox 底图仍执行正常地图网络请求。蓝点只来自新鲜系统观测，过期观测撤下。查看 G1/G2 只改变镜头，不替代蓝点位置。公开轮廓以中性描边展示，不作为已认定公寓的高亮。
- 地图复用已锁 Mapbox/light-v11、建筑门牌与英制比例尺；候选标签与蓝点应可同时辨认。

本地复现命令：

```sh
./scripts/dev exec node scripts/field/build-review-data.mjs --check
./scripts/dev exec node scripts/field/build-ios.mjs simulator
./scripts/dev exec node scripts/field/build-ios.mjs device
```

原生生成目录使用当前 Expo 58 的 `--no-clean`，不得清空已安装 Pods。日志、地图公开 token、签名产物及设备标识仅留忽略目录。首次实现误用默认 prebuild 清除了生成目录；已用审查过的锁文件执行 `pods:install --deployment` 恢复，修正为保留目录模式，无依赖升级或业务资料丢失。实际构建/安装证据在本文后续表中记录。

## 3. 用户最少配合

先在出发前验证安装包，再在正常配送经过时核对入口，不要求专程前往。

1. 打开独立“Abasong入口核对”，应直接进入 Woodside 地图，无 URL 输入、登录或资格提示。
2. 点击定位，按需亲自允许“使用 App 时”与精确位置；确认蓝点正确即可，不发送具体位置。
3. 手机关闭 Wi-Fi，保留蜂窝数据，重新打开该独立版本；确认页面、地图与 G1/G2 切换正常。不需要关闭 Mac 网络或停止普通开发服务。
4. 下次停车配送时反馈：G1 / G2 / 两个都是 / 都不是或不确定；入口服务整个社区还是部分区域；通常在门外人行道、外部车道还是门内停下。无需提供密码、收件人、轨迹或截图。

签名有效期从实际构建描述文件读取，出发前核查。个人开发签名不是长期分发；到期需 USB 重签安装。底图断网缓存未作保证，不能把蜂窝可用称为全面离线可用。

## 4. 完整业务 HTTPS 环境的实际缺口

2026-11-01 使用已连接 Supabase 工具只读核对：AbasongDevWest 为 `us-west-1`、ACTIVE_HEALTHY、PostgreSQL 17.11；迁移列表为空，`abasong` schema 无业务表。没有查询账号、密钥或私人业务内容，也没有执行云端写入。

| 条件     | 当前事实                                                 | 下一步可审查交付                                                                                   |
| -------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| App 启动 | 普通 iPhone 包是 Debug 开发客户端；A 有独立 Release 入口 | B 构建普通业务 Release，绑定固定 HTTPS 地址；不打包 D0 秘钥/TEST 后门                              |
| 身份     | Supabase DevWest 已用于真实短信登录                      | 指定仅开发用途，校验 issuer / audience 与真实会话恢复；不迁移旧项目身份                            |
| 业务资料 | 业务表、匹配和密文仍在受保护本地 D0                      | 云端迁移计划、受限角色、兼容检查和备份回滚；明确授权项目后才应用，不把本地整库上传                 |
| 加密     | 当前 `LocalEnvelope` 在 production 下主动拒绝工作        | 实现 KMS 信封适配与上下文隔离、去重 HMAC 密钥方案，KMS 故障/撤销回归。不得通过改 NODE_ENV 绕过保护 |
| API      | Mac API3002 / Metro8082 的授权仅同一可信局域网           | HTTPS 常驻 API、鉴权/对象权限、最小日志、限流、版本与就绪检查；不公开 Mac 端口                     |
| 识别范围 | G1/G2 仅候选；正常自动认定未启用                         | 核对入口/服务范围，审批独立版本化到达区域及有效期；只启用指定公开样本                              |
| 测试资料 | 无本批新增账号能力或真实门禁                             | 仅合成 TEST 资料，逐账号/范围/时限授权、自动到期与撤销验证；移除 TEST 后核查                       |

部署方向继续遵循现有架构：AWS 北加州 `us-west-1`，ECS Fargate API、ALB/ACM HTTPS、KMS/Secrets Manager，与 DevWest 同区。账户、域名控制、预算和资源还未核定，因此本批不生成可直接 apply 的伪完成部署。下一批先完成容器与 KMS 接口、迁移预检、精简资源清单/费用估算，再以明确环境与预算申请最终创建/部署授权。身份开发项目能否兼任第一轮受控业务开发库，也应在该授权中写清。

本批查阅的替代方案 Render 有 Oregon 区域，非北加州；免费 Web Service 闲置 15 分钟会休眠，重启通常约一分钟。推论：它的免费实例不适合作为司机到门口即时查码的现场时延验收环境；本批不为此改变原区域决策，也不注册新账号。[区域](https://render.com/docs/regions)、[免费实例限制](https://render.com/docs/free)。

## 5. B/C 必须实际通过的验收

| 场景                     | 通过标准                                                              |
| ------------------------ | --------------------------------------------------------------------- |
| 蜂窝冷启动               | Mac 开发服务不可达仍直接进入业务 App；会话恢复、地图与 HTTPS API 可用 |
| 未登录 / 无资格 / 错 JWT | API 拒绝敏感资料；公开地址与密码错误状态清晰分离                      |
| 移动 → 门外停稳          | GPS 与范围/稳定性观测满足后才自动选定；不以搜索目标或最近邻替代位置   |
| 正确对象 → 密码卡片      | 单行门牌+街道、原样符号密码、贡献用户名；无资料与网络失败分别展示     |
| 手动阅读 / 回位          | 不抢视野；显式回位解除临时阅读；不搬动蓝点到公寓中心                  |
| 离开 / 粗略 / 失效       | 自动卡与高亮撤下，慢匹配/密码/轮廓响应不能恢复旧对象                  |
| 弱网 / 前后台 / KMS 故障 | 不显示旧密码冒充最新结果；恢复后重新确认；真实 GPS 不落日志           |
| 环境/权限撤销            | 指定能力与识别到期，终端下次请求立即失效；同意的清理范围可核查        |

## 6. 实际执行记录

| 检查 | 本批实际结果 |
|---|---|
| `./scripts/dev check` | 最终 160 项 / 28 文件通过，lint / 全仓类型 / API与worker构建通过。一次沙箱限制导致回环HTTP监听EPERM，按同一范围重跑后通过，无代码放宽 |
| 独立 iOS Release | Simulator与iphoneos均真实编译；内置JS约1.58MB，相同SHA256为`fc8de9296e59e76dc45448405e313a67c7f36c8dcfc07fcaabdb9d96e6d4f9f8`；源映射无普通路由/Auth/公寓API客户端。iphoneos codesign验证通过 |
| 独立包配置 | bundleID/桌面名正确，ATS不允许明文/局域网例外；构建后普通生成工程恢复`com.abasong.mobile`与原scheme。应用依赖与锁文件无变化 |
| Simulator实际页面 | iPhone18Pro/iOS27.0直接启动；G1/G2切换、独立橙色候选标签、公开G1注入蓝点与标签不重叠、回位、观测过期撤蓝点、后台再恢复均观察。按钮切换不作为自动认定 |
| iPhone实际安装 | iPhone13Pro/iOS27.0.1安装、启动成功，已看到公开入口地图与卡片，无URL或登录页；原Abasong保留。镜像触控不可靠，由用户补验入口按钮/精确蓝点/关闭Wi-Fi后蜂窝重开，回复“正常，我现在可以去Woodside”；这几项记用户辅助通过，不等于已到现场核实入口 |
| 签名期限 | 实际描述文件到期`2026-11-08T18:37:00Z`，洛杉矶11月8日10:37；出发前再核查。只在忽略目录保留签名/设备资料 |
| 普通版回归 | 普通 iOS/Android/Web JS导出通过；静态39页面/295状态、83路径/108操作/128模型与文档链接通过。本批未做Android原生重编译，不以JS导出冒称双端真机验收 |
| 数据/云端 | 公开fixture漂移检查通过；只读Supabase元数据核对完成。未执行业务DB/权限修改或云部署，未新增真实/TEST门禁记录，正常自动匹配继续关闭 |

本地忽略证据位于`.tooling/field-kit/`：各目标构建报告/日志、签名期限摘要、安装/启动结果、工程检查与JS导出/静态结果、模拟器公开测试截图。包含设备侧栏的截图不纳入仓库。首轮生成目录误清与Pods恢复已在第2节记载；静态校验第一次误用不存在的Python虚拟环境入口，改用既有`PYTHONPATH=/private/tmp/abasong-v12-validation python3`后通过，无重新安装。

尚未通过：G1/G2现场身份与服务范围、实际到达区域、完整业务HTTPS/云KMS、真实自动卡片现场与Android实体设备。已向用户发送公开入口/服务范围/停靠位置三项核对，无需提供密码或具体GPS。独立工具不改变这些D1出口。

官方实现依据：[Expo 本地 Release 构建](https://docs.expo.dev/guides/local-app-production/)、[Expo 58 前台定位](https://docs.expo.dev/versions/v58.0.0/sdk/location/)、[AWS Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)、[ECS task role](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)、[KMS data key](https://docs.aws.amazon.com/kms/latest/developerguide/data-keys.html)。方案已准备不等于 B 已部署、云迁移已执行或 D1 已完成。
