# DevWest 内测部署材料 · A2

更新：2026-11-03。环境 `pilot-dev`；区域 `us-west-1`；唯一 Supabase 项目 `mxlmemaunzoramgemiju`；目标 API `https://api-dev.abasong.com`。这些材料可审查，尚未在云端执行。A4 需要账号、具体资源费用和环境确认。

## 当前启动工具（2026-11-03）

用户已恢复按序推进；Mapbox账号用户名ollyyin，用户已添加付款方式，临时接口及本机永久编码已实测恢复；AWS仍待本人[注册与MFA](../../docs/technical/A4_AWS注册与短期访问准备.md)。已在项目忽略目录安装并验证官方签名/公证AWS CLI2.39.3，`./scripts/aws --version`可用。包装脚本使用`.tooling/aws/config`、`.tooling/aws/credentials`、profile `abasong-pilot`及us-west-1；不使用全局默认配置，不代替IAM/目标核对。当前没有登录或创建凭据。账号就绪后采用短期SSO身份，不让用户发送root密码、长期key或验证码。

`./scripts/dev mapbox:verify-live`或追加`--server-token`分别核验本机移动端/API公开token，最多6次临时公开样本请求、无重试/永久编码/正文落库；早前401时只发1次即停止；用户添加卡后六项临时探测均200，永久编码也经另批有界验证，本机已开启，云环境仍需单独配置。`./scripts/dev cloud:preflight --manifest`已生成9次离线迁移清单。真实云操作仍按下文预检和受控执行，不改D0防护。详见[启动记录](../../docs/technical/A4_Mapbox恢复与云内测启动记录.md)。

本地已交付[独立业务构建配置及限期资格工具](../../docs/technical/A4_A5_独立内测配置与限期资格验收.md)：生产JS导出通过，但不是已签名安装包；资格执行器当前仅D0，云管理员角色/执行器待本环境明确审查，不能复用D0 postgres连接。普通API/worker权限不因本工具扩大。

## 加密与运行边界

共享密码、私存条目/密码、截图候选均使用同一 `EnvelopeCrypto`，服务端所有调用均 await。D0 保留 local-envelope-v1；云端 aws-kms-envelope-v1 使用 KMS GenerateDataKey(AES_256)→本机 AES-256-GCM，保存密文数据密钥；Decrypt 绑定相同 Key ARN 与 encryption context。DEK 每次使用后覆盖，不设跨请求明文密钥缓存。上下文只包含app/env和AAD摘要，原地址、密码、司机位置不进入CloudTrail上下文。[AWS流程](https://docs.aws.amazon.com/kms/latest/APIReference/API_GenerateDataKey.html)、[Decrypt](https://docs.aws.amazon.com/kms/latest/APIReference/API_Decrypt.html)。

环境、用途、对象/owner/version绑定到AAD。共享去重和幂等使用独立HMAC根密钥，保存在本环境Secrets Manager；版本为pilot-v1。自动轮换KMS密钥材料可以保留ARN；不要直接更换KMS ARN或HMAC根密钥/版本，历史读取/重建索引需要另行设计迁移。当前适配器只接受已配置的单个ARN，不声称具备完整密钥环迁移。

KMS错误返回503，写事务回滚，不切到本地密钥。生产镜像固定 `dist/cloud.js` 入口，改 NODE_ENV/ABASONG_ENV 不能切到D0；生产配置不接收本地KEK或管理员连接。云端从公开资料和明确授权贡献开始，不复制D0数据库、TEST资料或本地密钥。0009只扩展格式约束，不重写旧数据。

## 可复现容器

```sh
docker build --platform linux/amd64 --target api -t abasong-api:a2 .
docker build --platform linux/amd64 --target worker -t abasong-worker:a2 .
./scripts/dev exec node scripts/cloud/verify-containers.mjs abasong-api:a2 abasong-worker:a2
```

Node24.22.1官方镜像固定digest；pnpm10.32.1与冻结锁。构建上下文白名单仅包含API/worker/contracts/runtime源码和包管理配置，不传.env、截图、原生签名或.tooling。两个镜像均为非root用户node，可只读文件系统运行；ECS任务同样关闭额外Linux能力，临时目录单独挂载。

本地已实际构建并运行：合成配置、断网且不开放主机端口，live200/ready503/auth401、缺失配置和改标签拒绝启动。不是AWS部署或真实KMS验收。worker只清理过期导入候选，不具备云OCR/outbox消费能力。

## 配置与权限

模板见api.env.example/worker.env.example，不能原样部署。API执行身份仅获得本环境四项运行秘密（普通连接、敏感连接、HMAC根密钥、Mapbox公开服务token）；worker仅获得自己的连接。拉镜像/读取指定Secrets的execution role与调用KMS的task role分开。[ECS角色说明](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html)。API KMS策略模板需要替换为唯一实际ARN；worker不授KMS权限。

数据库三个独立LOGIN继承现有普通API、敏感服务和worker角色，均非superuser/createdb/createrole/bypassrls。`runtime-roles.sql` 只准备新角色，不填密码，若已有角色则停下检查。新密码由受控管理员会话生成配置，不进入Git、命令行或对话。服务URL必须为指定DevWest直连或北加州session pooler5432，sslmode=verify-full；拒绝管理员账号、其他项目、6543及降低TLS验证。实际主机/自定义角色pooler兼容性在DevWest连接面板及授权部署时验证。[Supabase连接说明](https://supabase.com/docs/guides/database/connecting-to-postgres)。

普通API/worker不获得管理员停显数据库身份。当前停显CLI仍严格D0；云端一次性管理任务/受限函数及MFA访问条件需A4专项验证，不能把postgres密钥塞入服务任务。本批没有新增普通审核页。

## 独立迁移与回滚

先运行离线清单：`./scripts/dev cloud:preflight --manifest`，生成9个SQL文件的SHA256。预检连接只接受DevWest + pilot-dev + 管理员TLS，并在 READ ONLY事务核对PostGIS所在schema、连续版本和云端不含本地信封。云秘密通过0600、忽略的独立文件由操作者加载，勿用D0 .env。受控会话下执行 `./scripts/dev exec node --env-file=.env.cloud.devwest ./node_modules/tsx/dist/cli.mjs scripts/cloud/preflight.ts --read-only`。脚本没有apply模式，不会迁移；不修改D0目标防护来连接云库。

A4审批后：备份/确认恢复能力→只读预检→逐个按顺序应用未安装迁移→初始化经确认的策略与公开资料→创建/核对运行角色→RLS/权限检查→部署容器。Supabase现有Auth用户不被删除/重建，不开放abasong为PostgREST schema。若PostGIS不是extensions或版本不连续，停下审查，不自动移动扩展/清库。

迁移每文件事务化，失败文件回滚，已成功的版本保留。0009向前兼容D0旧信封；正式云开始写KMS后，不能把旧local-only API作为回滚版本。保留本次KMS兼容镜像digest作为最低回滚版本，通过ECS切回经验证revision；严重故障先停止写入并维持明确503，不降级加密。灾难恢复先核对Supabase套餐的备份/PITR能力，不能把不存在的备份当保证。不得删除KMS密钥来回滚。

## 网络、DNS与验收

拟议单API任务+单worker任务，各0.25vCPU/0.5GiB，Linux x86_64；一个双AZ ALB+ACM证书。初期不启NAT Gateway；任务可有受安全组限制的公网出口，API入站只接受ALB安全组，worker无入站，数据库走TLS。未经过压测扩容前不自动增加任务；50/80/100美元预算提醒不是硬封顶。

2026-11-02只读DNS显示NS为launch1/launch2.spaceship.net，api-dev尚无A/CNAME。还需账户内确认编辑权；仅新增api-dev指向实际ALB与ACM验证记录，不改www或整区NS，不先填占位CNAME。

A4再完成HTTPS、限流、最小日志、监控、过期内测资格和双真实账号闭环。日志只记录必要request-id/状态/延时，不记录密码、JWT、截图/OCR原文、手机号或精准定位。当前没有上线监控/分布式限流实现，部署前不能省略。核心现场版通过后才进入临时支援。
