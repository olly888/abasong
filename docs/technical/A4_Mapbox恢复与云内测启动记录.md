# A4 Mapbox恢复与云内测启动记录

2026-11-02，America/Los_Angeles。用户同意按“Mapbox标准访问恢复→公开样本实时核验→最小云端内测→独立iPhone业务版”继续，取代先前暂缓推进的决定。目标仍为`pilot-dev`、AWS北加州`us-west-1`、现有DevWest项目`mxlmemaunzoramgemiju`与`api-dev.abasong.com`；不改变生产/main发布状态。

## 当前事实与用户操作

| 项目 | 实际状态 | 下一步 |
|---|---|---|
| Mapbox账号 | 本机移动端与API公开token解析出的用户名均为`ollyyin`；不读取或记录token本体 | 用户已回复添加卡；两端token一致，无需更换。后台计费页尚未重新登录读取 |
| Mapbox接口 | 添加卡后6项临时接口及SDK样式均HTTP200，访问已恢复 | 永久编码已按官方条件及有界请求单独核验，本机启用；真实现场仍待 |
| AWS账号 | 用户回复尚未注册，将本人完成 | 注册、付款/条款与root MFA由本人操作；不在聊天发送凭据 |
| AWS本机工具 | CLI2.39.3已在项目忽略目录运行，无全局安装或现有凭据 | 账号就绪后建立本环境短期身份；不使用root长期access key |
| 云库迁移 | 离线9个版本SHA256清单通过；未连接云库 | 确认目标/备份与恢复能力，再只读预检、受控应用 |
| 云资源 | 尚未创建 | 在账号及身份就绪后按已审查资源规模部署，不先创建占位DNS |

本轮继续沿用[资源清单](A2_资源费用与账号准备.md)：低流量AWS约60–80美元/月，100美元预算提醒，非硬限额；其他供应商另计。实际区域、账号、资源和权限须在执行前核对。若方案超出该规模，先更新具体差异，不擅自扩容。新账号抵扣不作为长期费用保证。

## 永久新地址续核（2026-11-02）

[新地址闭环](A3_新地址永久保存与贡献闭环验收.md)记录当前官方有效卡要求、一次Del Mar永久探测及一次Acappella真实服务/隔离库联测。本机开关已启用；这覆盖下方早期“永久0/关闭/待核对”的当前状态，不改写其历史。真实账号未获新资格，云资源与业务迁移仍0，云配置默认关闭。

## 工具与诊断

AWS CLI来自官方`https://awscli.amazonaws.com/AWSCLIV2.pkg`。Apple验证结果为AMZN Mobile LLC开发者签名、可信时间戳及公证；包版本2.39.3，SHA256 `f9014f2edc9d4f40cb1f6662f1ec6d0f2d89d60d9d452f830008d9d92ca49f22`。签名验证后将官方Payload解包到`.tooling/aws-tools/aws-cli`；无sudo、全局链接或额外技能/MCP安装。原包和Apache许可证保留在忽略目录。

`./scripts/aws`使用该本地CLI，并将配置/credentials文件限定到`.tooling/aws/`，默认profile `abasong-pilot`、区域`us-west-1`。关闭自动EC2元数据探测和pager。此包装只隔离常用配置，不替代IAM、云目标核验或SSO自身缓存管理。当前只执行version/list-profiles，无账号登录、SSO缓存或云API调用。

新增`./scripts/dev mapbox:verify-live`，默认读取移动端本机公开token；`--server-token`读取API本机公开token。样本固定为公开Del Mar地址，不使用司机定位、截图或密码：

1. 真实`light-v11`样式；未通过立即停止后续产品核验。
2. 临时Geocoding v6正向地址。
3. 同一临时坐标200米building Tilequery，不做补查或整区采集。
4. 临时Geocoding v6反向地址。
5. Search Box地址建议及一次点选，复用同一会话。

总计最多6次HTTP，无自动重试，不调用永久编码。仅输出产品名、HTTP/错误类别、结果数量与调用次数；不输出token、供应商ID、坐标、查询原文、URL或响应正文。成功只说明该诊断输入下接口响应与结构可用，不证明地址关联、完整覆盖、许可额度或原生现场正确。

永久编码需在控制台核对实际资格与计费后单独验证；不能用临时诊断成功自动开启持久化。升级若轮换token，按本机忽略配置更新SDK和API后重启相关服务，不提交Git。

## 本批验证与边界

- 新增5项诊断测试：6请求预算与Search Box会话复用、401立即停止、正向失败不派生坐标调用、异常凭据不外泄、超大/错误200响应拒绝。
- `./scripts/dev check`：247测试／44文件、lint、类型及构建通过。首次受sandbox禁止loopback影响，既有2项HTTP测试EPERM；允许本机监听后重跑通过，不改产品逻辑规避。
- 离线`cloud:preflight --manifest`通过，9个迁移校验。首次tsx IPC受限，允许后执行；未连接数据库或创建云资源。
- `mapbox:verify-live`实际只调用样式1次，HTTP401；其余5项跳过，退出失败符合预期。没有报成6项真实接口通过。
- 本批不改App页面、API业务、数据库迁移或原生依赖，不重复未受影响的设备手势/构建。先前代码`39a4504`对应CI41571947868通过；新提交另查对应CI。

## 添加卡后的恢复复核（2026-11-02）

用户回复已绑定卡后，`mapbox:check`实际SDK streets-v12样式HTTP200；`mapbox:verify-live`使用公开Del Mar输入，6个请求全部HTTP200：light-v11样式、临时正向、building Tilequery、临时反向、Search Box建议/点选。正向1结果、反向1结果、建议/点选各1；building返回50个要素，其中15个type=apartments。50为查询上限，15是建筑要素数，不是15个独立公寓或完整覆盖保证。临时结果正文/坐标/ID仅在进程内使用，不写入业务库。

移动端与API当前token值相同，未读取/打印正文或修改配置，因此本次仅需一组完整诊断。现有token继续可用。账单控制台已退出登录，本次没有读取付款信息或确认实际套餐标签；结论限定为真实API访问恢复，不把HTTP200当永久编码许可。永久请求仍0，开关保持关闭；没有云操作或新原生验收。

本次仅同步外部状态与验收记录，App和工具代码未变；静态/链接及差异扫描通过，未重复本地构建或设备手势。准备代码9c37e94对应CI41574394927通过，文档跟进的最新CI仍在PR49跟踪。上文“一次401、后续跳过”为绑定卡之前的历史记录。

## 账号就绪后的执行出口

先恢复Mapbox并用移动端/API配置分别核验；再以公开地址执行真正的生产服务匹配和双端地图验证。AWS账号确认后，配置短期受限部署身份、预算提醒和指定区域资源，完成真实KMS、DevWest角色/TLS/迁移、HTTPS与最小监控。DNS只写实际API和证书验证记录，不改www/NS；不复制D0 TEST或密钥。

最后交付`com.abasong.pilot`固定HTTPS、内置JS业务包，两真实账号完成贡献→读取→反馈→纠正，再做iPhone蜂窝冷启动与正常配送现场验证。账号/Mapbox未就绪时保持明确依赖，不声称A4/A5完成，也不重新索要已同意的同规模费用方案。

官方依据：[Mapbox升级流程](https://docs.mapbox.com/accounts/guides/demo-access/)、[AWS CLI官方安装](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)、[AWS CLI短期SSO身份](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)。
