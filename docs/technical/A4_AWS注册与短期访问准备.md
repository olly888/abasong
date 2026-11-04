# AWS 注册与短期访问准备

更新：2026-11-03。账号已注册并由本人确认官方CLI短期登录；当前Free方案，root及项目用户MFA均已由本人开启；项目用户密码及短期登录已核对，要求MFA的受限角色实际STS通过；基础层创建等待具体资源及费用批准。DevWest业务建表已完成，AWS资源尚未创建，见[实际接入记录](A4_账号接入与云数据库迁移记录.md)。以下注册步骤供后续参考。

## 注册入口与选项

使用 [AWS 官方高级注册入口](https://signin.aws.amazon.com/signup?request_type=register)。Advanced 指完整账号配置能力，不是付费技术支持等级。Abasong 需要指定北加州 `us-west-1`、细分IAM权限和ECS/KMS/网络配置，因此选择此路径；AWS新版简化注册不能自行选择具体资源区域，权限配置也受限。[官方对比](https://docs.aws.amazon.com/accounts/latest/reference/sign-up-for-aws.html)

1. 使用你长期控制的邮箱，账号名称可填 `Abasong`；本人验证邮箱并设置密码。
2. 按页面填写真实联系、账单和身份信息；本人阅读并接受协议、确认账号方案与付款信息。支持计划先用 Basic，不需要购买商业支持。账号方案和支持计划是不同选项；费用仍按已审查资源范围，部署前核对实际价格。
3. 账号激活后，登录控制台，在账号菜单的 Security credentials → Multi-Factor Authentication → Assign MFA device 中绑定本人的MFA。密码、验证码和MFA恢复资料不发送到聊天。
4. 告知“注册完成、MFA已开启”即可；不需要现在创建ECS、数据库或长期Access Key。

[AWS注册步骤](https://docs.aws.amazon.com/accounts/latest/reference/getting-started.html)、[root MFA步骤](https://docs.aws.amazon.com/IAM/latest/UserGuide/enable-virt-mfa-for-root.html)。

## 我们如何协作

工程侧可以协助说明和操作普通配置，但付款、身份验证、协议确认与本人MFA由账号所有者完成。当前不需要安装AWS插件；项目已隔离安装官方AWS CLI，`./scripts/aws --version`可用，已通过本人确认的短期登录缓存会话；未创建长期Access Key。插件不能代替账号注册或获得额外授权。

账号就绪后再核对账号/区域、使用官方aws login短期会话核对，再配置经审查的项目限定部署角色，接着按[部署手册](../../deploy/pilot-dev/README.md)执行预检。不要用root日常部署，不把本地D0脚本或连接改为云库，不在聊天发送长期密钥。DNS只涉及已批准的api-dev与证书验证记录，不改www主站。

资源规模与费用继续参考[资源费用方案](A2_资源费用与账号准备.md)。注册完成不表示资源已部署，也不表示iPhone业务已可脱离Mac运行。
