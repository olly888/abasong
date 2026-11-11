# A4 运行身份、服务凭据与 HTTPS 部署方案

更新：2026-11-03，America/Los_Angeles。分支 `codex/d1-runtime-deployment-preparation`，父基线 `9e92372`（CI41755847690通过）。

**本批交付可审查模板、运行修正和验证，不创建下一层云资源。** 六项基础资源保持原状；DevWest九次迁移/52张强制RLS业务表不变。A4、A5和D1尚未完成。

## 1. 下一交付及范围

固定 `pilot-dev / us-west-1`、现有DevWest、`https://api-dev.abasong.com`。目标是一个不依赖Mac的受控业务API，让独立iPhone业务版在蜂窝网络上完成附近查码、贡献、反馈和本人纠正。

沿用当前产品和UI基线。本轮没有新的移动页面、业务接口、数据库迁移、OCR服务或依赖。worker仍只进行数据库探测和有界导入草稿清理；不宣称已经消费outbox或执行云OCR。

## 2. 可审查材料

| 材料 | 作用 | 资源数 |
|---|---|---:|
| [identities.json](../../deploy/pilot-dev/identities.json) | 四个服务角色、五个空秘密；不包含凭据正文 |9|
| [notifications.json](../../deploy/pilot-dev/notifications.json) | 一个SNS主题、本人邮箱订阅、主题策略、100美元月预算 |4|
| [certificate.json](../../deploy/pilot-dev/certificate.json) | 单一域名DNS验证、禁止导出的ACM公有证书 |1|
| [runtime.json](../../deploy/pilot-dev/runtime.json) | 两个Fargate服务及任务、网络、ALB/HTTPS、六个告警 |29|

合计43个模板资源；不重复创建既有六项基础资源。此外首次使用ECS和ELB需要两个AWS服务关联角色：本批只读检查均尚不存在，后续创建也须纳入授权。模板的`ReviewOnly`是说明元数据，不是AWS权限保护；当前准备命令没有apply选项。

生成源为[scripts/cloud/runtime-templates.ts](../../scripts/cloud/runtime-templates.ts)。变更生成源后运行 `./scripts/dev cloud:templates`，CI检查产物一致性。

## 3. 运行身份

| 身份 | 可获得的权限 | 明确边界 |
|---|---|---|
| API execution role | 拉取本项目API仓库、写入API日志流、读取API四项秘密 | 不访问业务KMS密钥 |
| API task role | 现有唯一业务KMS密钥的GenerateDataKey/Decrypt | 必须匹配app/environment/AAD摘要上下文；没有Secrets、IAM或数据库管理权限 |
| worker execution role | 拉取worker仓库、写入worker日志流、读取worker连接 | 无API/敏感连接/HMAC/Mapbox秘密；不访问业务KMS密钥 |
| worker task role | 无AWS业务调用 | 显式Deny；当前草稿清理不需要AWS API |

四个角色只信任`ecs-tasks.amazonaws.com`，限制当前账号及北加州ECS来源。凭据由ECS提供，不放长期AWS key。execution角色凭据不会作为业务任务角色凭据暴露给应用。[官方execution角色](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html)、[task角色与来源限制](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)。

现有foundation部署角色明确Deny IAM操作，没有PassRole；**不能给它随意追加Allow并假定已生效**。实际执行前准备独立的MFA运行层部署权限变更：项目固定stack/资源，PassRole仅限这四个角色且PassedToService为ECS任务，首次服务关联角色仅允许ECS/ELB服务名。bootstrap身份只用于经审查的IAM变更；不能把root作为ECS/网络的日常部署身份。该增量策略、Access Analyzer及真实权限模拟是下一执行批的前置出口，本批未写入IAM。

## 4. 五项服务凭据

| Secrets Manager名称后缀 | 注入变量 | 数据库/用途 | 谁能读取 |
|---|---|---|---|
| api-db |DATABASE_URL|abasong_api_dev|API execution|
| sensitive-db |DATABASE_SENSITIVE_URL|abasong_sensitive_dev|API execution|
| worker-db |WORKER_DATABASE_URL|abasong_worker_dev|worker execution|
| data-hmac |DATA_HMAC_KEY|独立新32字节hex根密钥，pilot-v1|API execution|
| mapbox-search |MAPBOX_SEARCH_TOKEN|本环境API公开token|API execution|

完整名称都以`abasong/pilot-dev/`开头。秘密用Secrets Manager默认托管加密；业务信封加密使用已有客户管理KMS，二者用途分开。模板只建空秘密，尚未生成、设置数据库密码或上传秘密值。

凭据配置顺序：

1. 在DevWest连接面板核对真实主机；优先核验北加州session pooler的IPv4/5432及自定义角色登录。模板容许的直连主机若只有IPv6，不能直接用于本方案的IPv4任务。不能猜测pooler编号。
2. 通过明确授权的受保护管理员会话，为现有三个受限LOGIN分别生成不同密码，不重建角色或扩大授权；连接必须为指定项目、`sslmode=verify-full`，拒绝postgres管理员、6543或TLS降级。
3. 生成本环境新HMAC；不复制本地D0密钥/TEST数据。Mapbox核对API token能力、有效账户及云端永久保存资格；不因本机成功就自动启用云永久地理编码。首次模板保持永久编码false，核验后再明确启用。
4. 经忽略目录中的0600临时文件或受保护进程输入设置五项值，禁止放Git、聊天、命令行参数或完整日志。只保留无正文配置回执，临时凭据文件用完清理。不要读取已有秘密到工具输出。
5. 使用每个受限身份独立实测TLS/权限；普通API、worker不能读取共享正文密文表；用户对象权限继续由认证API验证。KMS用合成资料实测加解密、错误上下文和拒绝场景，不在测试中输出门禁密码。

ECS启动时注入秘密，更新Secrets Manager不会自动刷新现有容器，必须重新部署任务。[官方说明](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html)。数据库密码轮换在维护窗口协调连接与任务，HMAC或KMS ARN更换需要另行迁移方案，不能当作普通密码轮换。既有历史密文仍需原密钥。

## 5. API/worker 容器与网络

每项任务使用Fargate Linux/x86_64、0.25vCPU/0.5GiB、平台1.4.0，镜像固定ECR内容digest；同一个已验证提交构建两张镜像并检查扫描结果后再部署。当前内存值是试点起点，实际冷启动/压力指标不达标时重新评估规模和费用。

容器以UID1000运行，只读根文件系统，drop全部Linux能力。`/app-tmp`使用单独可写卷，镜像预设node所有权；不使用Fargate不支持的tmpfs任务配置。此目录仅保存短期状态，不保存共享密码或依赖其持久化。[Fargate存储](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-storage.html)、[非root卷权限](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/bind-mounts.html)。

| 层 | 入站 | 出站 |
|---|---|---|
| ALB |公网80/443|仅API安全组3001|
| API |仅ALB安全组3001|TCP443供应商/AWS，5432受限数据库|
| worker |无入站|TCP443及5432|

独立VPC、两可用区公共子网；任务分配公网IPv4用于出站，安全组拒绝直接入站。该成本选择省去NAT与多组接口端点，但不是私网任务架构，出站目的暂按端口限制。下一次改变网络方式需重新计算费用。[Fargate网络](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html)。

**单实例维护窗口部署：** desired=1、minimumHealthy=0、maximum=100，不自动扩容。现有地址搜索会话和保护计数位于进程内存，不能声称可横向扩展或无中断；先停旧再起新避免两API进程随机承接同一搜索会话。升级会短暂中断并清除未完成搜索会话，驱动端重新搜索；已提交的幂等业务记录仍在数据库。未来高可用/滚动发布必须先设计共享会话与分布式限流。

## 6. HTTPS 与 DNS

本批公开DNS读取确认`abasong.com` NS为`launch1.spaceship.net`、`launch2.spaceship.net`；`api-dev`没有A/CNAME结果。尚未验证Spaceship账户编辑权，不把公开NS等同于写入授权。

1. 经授权在us-west-1申请`api-dev.abasong.com`的ACM非导出证书。
2. 从实际ACM返回值提取唯一验证CNAME，在Spaceship添加；由用户或授权会话完成，等待ISSUED。不能预编或猜测验证记录。
3. 创建ALB：80固定重定向到该HTTPS域名，443使用TLS1.2/1.3策略；默认返回404，仅正确Host路由到API。
4. API、worker连接及加密检查通过后，把`api-dev` CNAME指向实际ALB DNS。**不改www、根域、邮件、NS或现有主站记录。** 保留ACM验证CNAME供续期。
5. 用普通系统证书验证测试HTTPS；禁止关闭TLS校验。证书未签发、服务不健康或业务前检失败时，不交付现场版。

ALB集成使用的非导出ACM公有证书没有额外证书费用，不包含ALB/IPv4费用；导出证书不在本方案内。[ACM官方FAQ](https://aws.amazon.com/certificate-manager/faqs/)。

## 7. 健康检查、限流与日志

- API容器检查`/health/live`；ALB检查`/health/ready`，后者验证数据库和全部必要迁移。**ready并未检测敏感连接、KMS、资格、Mapbox，不能代替业务预检。**
- worker增加原子写入的0600状态心跳及独立`dist/health.js`；数据库失败、记录缺失/损坏/过期均失败。轮询串行，停止时先等当前操作结束再关连接，避免积压。心跳只含状态/时间，不含数据库异常正文。
- 云API仅信任一跳ALB，且必须与ALB追加XFF、API仅允许ALB安全组配套；不能单独复制trust-proxy设置到任意公开服务器。[ALB转发头](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/x-forwarded-headers.html)、[Express规则](https://expressjs.com/en/guide/behind-proxies/)。
- 首批保护为单进程业务50请求/秒、独立健康检查10请求/秒、同来源240请求/分钟、最多5000个内存计数条目；来源仅以进程临时HMAC保留，过期删除，不记录IP。多人共用网络可能共用限额，试点观察后调整；它不是WAF或分布式配额。原有Mapbox会话/用户配额继续生效。
- 应用HTTP日志只记录服务器request UUID、粗路由组、方法、状态和耗时；不记录路径、query、正文、JWT、联系方式、门禁密码或GPS。关闭云端Nest原始异常日志及ALB完整访问日志，避免地址/坐标进入日志；CloudTrail保留AWS控制面审计。
- 六项标准告警：两个服务各CPU/内存、无健康API目标、目标5xx；SNS邮箱需本人确认订阅。100美元/月预算按账号总量、不含credit/refund抵扣计算，50/80/100%实际用量提醒，不发送预算动作、不自动停机。预算告警有延迟且不是费用硬上限。[无动作预算免费](https://aws.amazon.com/aws-cost-management/aws-budgets/faqs/)。

部署脚本仍须等待ECS服务稳定并核对当前部署结果；首次部署没有既往COMPLETED版本可自动回滚，不能只依赖circuit breaker。失败时将本批服务desired降至0并停止后续DNS/分发，保留日志和密钥排查。[ECS官方回滚限制](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html)。

## 8. 当前价格与确认范围

2026-11-03读取官方北加州Price List，以730小时/月、两个任务、至少四个公网IPv4及低流量估计，不减免费额和新账号credit：

| 项目 | 算法 | 美元/月 |
|---|---|---:|
| 两项Fargate任务 |2×730×(0.25×0.04656+0.5×0.00511)|20.72|
| ALB小时 |730×0.0252|18.40|
| IPv4 |4×730×0.005；ALB至少2、任务2|14.60|
| 已有KMS |当前密钥基础费，首次轮换前|1.00|
| KMS请求预算 |10万请求，保守不扣免费额|0.30|
| 五项服务秘密 |5×0.40|2.00|
| 六项标准告警 |6×0.10|0.60|
| ALB处理能力 |示例平均0.25LCU×730×0.008|1.46|
| 镜像、日志、传输、秘密读取等余量 |随用量浮动|3–15|
| 合计 |含已存在基础层；非保证报价|约62–75|

公网地址可因ALB扩展、任务替换或失败重试增多；LCU、日志和出网可超出余量。按月估算不代表只启动一天就收整月，也不能靠任务缩到0消除仍存在的ALB/IPv4费用。每轮现场测试后决定是否保留运行层；删除运行层前审查依赖，不能删除业务KMS或重置数据库。

来源：[ECS区域价目](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/us-west-1/index.json)、[ALB](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/us-west-1/index.json)、[IPv4](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonVPC/current/us-west-1/index.json)、[Secrets Manager](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSSecretsManager/current/us-west-1/index.json)、[CloudWatch](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/us-west-1/index.json)、[KMS](https://aws.amazon.com/kms/pricing/)。价格回执在本机忽略目录，仅记录公开单价。

税、Mapbox、Supabase、短信、Apple和域名费用另计。当前账号只读检查仍FREE/ACTIVE，不自动升级Paid，不承诺所有服务或费用都被credit覆盖。免费计划到期/credit耗尽的停用风险按[官方账户计划](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html)处理；若AWS要求升级才能继续，先报告具体提示并由本人决定。

## 9. 执行顺序与回滚出口

| 顺序 | 执行内容 | 必须满足才继续 |
|---|---|---|
| R1 费用/权限确认 |本方案规模及费用；通知邮箱；服务关联角色及项目部署身份增量|用户明确批准具体资源，不延用基础层授权|
| R2 身份与凭据 |四角色/五空秘密；受保护配置三个数据库密码、HMAC和Mapbox|TLS及分离权限实际通过；不复制D0|
| R3 证书与监控 |ACM验证、本人邮件订阅、预算|证书ISSUED、通知渠道有效|
| R4 镜像及运行层 |固定digest/扫描、29项模板资源|部署身份策略模拟通过、变更集库存正确、容器及数据库/KMS预检通过|
| R5 域名与业务前检 |唯一api-dev记录、公开资料及版本化运行配置|HTTPS、陌生账号拒绝、两个真实账号资格/贡献/读取/反馈/纠正及私存隔离通过|
| R6 独立业务版 |com.abasong.pilot Release签名安装、蜂窝验证|不依赖Metro/Mac，正常查码贡献纠正；Android实机仍待设备|

业务初始化与内测资格是单独的授权步骤：当前云端业务用户/资料为空，需要用云端明确限定的受控工具配置版本化运行参数、公开资料、首位MFA管理员和限期资格。现有D0资格/停显工具不能连接云库；API/worker不会获得ops管理身份。此项未完成前不邀请其他司机，不用临时放开RLS或客户端权限替代。

回滚保留原业务KMS/HMAC、数据库数据、审计和秘密；发布记录保存镜像digest、任务版本、配置版本、变更集及验证结果，不保存正文凭据。停止错误运行版本、按已审查的旧digest恢复，不用向下迁移删数据。首次没有旧版本时明确保持服务停止，修复后再部署；失败期间不把空结果显示为“没有共享密码”。

## 10. 本批实际验证

- `./scripts/dev check`：lint、类型、292测试/51文件、build通过。首次沙箱阻止两个HTTP测试监听本机端口；允许本地端口后完整重跑通过，不改测试或业务逻辑规避。
- D0真实数据库验证：52张表及强制RLS、权限分离、回滚通过；鉴权54、业务HTTP295、导入124、排序18，另有地址PostGIS8、附近覆盖97、Mapbox合成链8、新地址11、内测资格22及KMS合成网关+真实PG检查通过。没有云数据写入或真实短信发送。
- 两个Linux/amd64镜像实际构建、非root/只读根/可写匿名卷/无主机端口/断网运行通过；API live200、ready503、auth401；worker真实断库心跳失败、合成正常及过期心跳状态检查通过。清理测试容器及其匿名卷。
- 四模板AWS只读ValidateTemplate通过；24种官方区域provider schema对43项资源属性离线验证通过。使用合成引用检查属性，不表示实际创建、权限、证书签发或网络已通过。原先合成两子网使用同ID被uniqueItems校验发现，修正验证器为不同合成ID后通过；未隐藏provider错误。
- 新增19项回归：轮询无重叠/停止等待、心跳异常、日志不含敏感字段、限流窗口，以及模板循环/未知引用、额外资源、明文秘密、越权角色、公开API端口、root、扩容、非digest镜像、跨账号/跨区/错误项目参数拒绝；私有参数JSON错误不打印原文或堆栈。
- 本批无移动UI/原生模块变化，不重复要求已通过的手势或把本地容器当作iPhone现场验收。最新提交/远程CI记录随集成补齐。

仍未执行：下一层IAM/Secrets/计算/HTTPS/DNS创建、服务凭据设置、真实运行KMS与双云账号、独立业务Release及蜂窝业务验收。
