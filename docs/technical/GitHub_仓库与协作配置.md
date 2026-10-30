# GitHub 仓库、历史扫描与协作配置

更新：2026-10-30。目标为用户明确授权的 **olly888/abasong 私有仓库**，代码、原型、设计与研发文档采用现有单仓。仓库/远程CI/看板完成情况以文末实际结果为准，准备文件不表示远程已完成。

## 首次上传前检查

初始范围为5015ba6及所有本地分支：19个可达提交、403个唯一历史blob、28个图片/PDF版本。另检查Git对象库10个不可达blob（不会随普通push上传），未清理或重写历史。

- 官方Gitleaks v8.30.1，通过官方发布校验和验证；工具仅安装在ignored .tooling，未改全局Node或Git运行环境。
- 可达历史使用`git --log-opts="--all"`扫描；报告100%脱敏，不在终端、Issue、仓库保存实际匹配原文。
- 图片使用本机Apple Vision OCR，PDF本机提取文字，识别内容仅留本机ignored目录；再用Gitleaks与针对性规则检查。
- 将历史对象与本机ignored环境中的12个凭据/连接串衍生字段比对；没有发现匹配。不得把环境文件复制到GitHub。
- 检查带手机号标签的文本/识别内容及私钥标记；除已知合成示例外无待复核命中。扫描不能证明OCR未识别文字、任意编码或语义内容绝对无敏感信息，合成资料声明和数据来源仍需保持。
- 两个历史generic-api-key告警已复核为误报：空IDEMPOTENCY_HMAC_KEY后的保留秒数配置赋值，以及Podfile.lock中的依赖校验和。`.gitleaksignore`只放这两个固定commit/file/rule/line指纹，不排除整段历史、整个锁文件或整个环境目录。当前环境样例增加注释避免跨行误判。
- 复核后历史、OCR/PDF提取内容、10个不可达对象均无未处理扫描告警；未发现需要重写历史的实际凭据。当前代码还会在首次push前再次扫描。

扫描原始材料留在ignored .tooling/security，不上传；这里只保留范围、方法、分类及工具来源。新提交由CI继续扫描，不能将首次检查当永久保证。

## 仓库与分支

默认分支main作为验证过的集成基线，保留codex/*工作分支。首次main从现有已验证提交历史建立，不丢弃旧提交、不强推覆盖用户仓库。后续功能通过PR，正文关联T任务、行为变化、验证与未测项；只有完成任务验收才使用Closes，部分工作使用Refs。

所有权仍为olly888，不新增协作者，不公开仓库/看板，不启用付费升级或自动生产部署。若当前套餐不支持私有仓库强制分支规则，应记录限制，采用PR流程约定；不得虚称已强制保护或擅自升级。

## 里程碑、Issues与看板

D0–D4映射[研发总计划](../Abasong_V12.1_项目开发与验收总计划.md)，不填写没有依据的截止日期。T01–T35按现有任务生成35个Issue，正文包括范围、前置、验收标准、当前事实、限制与文档依据。复用`abasong-task:Txx`标记，重复运行不创建同名任务副本。

初始状态保守同步：T01、T03工程范围完成；T04/T26/T32待验收；部分实现任务开发中；截图真实OCR等未实现任务待开发。T02含待完成的现场/建筑字段验收，放D1，不能因为D0底图通过就关闭整项。D0里程碑只包含其已通过工程任务；跨阶段任务保留完整验收范围。

看板状态以待开发、开发中、待验收、已完成为目标，关联仓库Issues；阶段/优先级、Issue链接与PR证据可追溯。仓库内总计划保存完整规范，Issues和看板保存执行状态，不复制成另一套PRD。暂不创建自动批量关单/生产发布规则。

## 自动检查

现有Engineering checks工作流运行：

1. 完整Git历史敏感信息扫描（fetch-depth0，固定工具版本、校验和、100%脱敏，禁止用行内注释跳过）。
2. lint、工作区/脚本类型、单元测试、API/worker构建及生成文件一致性。
3. 隔离Postgres/PostGIS迁移/RLS、身份、私人库/共享、排序及服务中断保护测试。
4. iOS/Android JS bundle检查，明确这不是macOS/Xcode或Gradle原生编译，也不是真机验收。

工作流只给contents:read，无生产密钥/真实短信/云端业务库；失败保持失败并修复，不将远程未运行写为通过。扫描先通过才执行工程作业；同一分支新提交可取消旧检查。

当前仍缺少远程原生二进制/真机、OCR实测、生产KMS等检查，继续按总计划完成，不用绿色CI代替全部业务验收。

## 本地复现与维护

```sh
./scripts/dev exec node scripts/security/install-gitleaks.mjs
.tooling/security/gitleaks git . --log-opts="--all" --redact=100 --ignore-gitleaks-allow --no-banner
python3 scripts/github/bootstrap.py --prepare-only
```

`bootstrap.py`实际写入前验证当前账号olly888、目标repo私有、存在本机扫描放行记录；不是CI步骤。只在明确授权的当前仓库使用。GitHub CLI凭据通过其正常认证管理，不写脚本、不输出token、不复制连接器内部凭据。

## 实际配置进度

本地完整扫描已通过；浏览器创建并核实olly888/abasong为Private，D0–D4共5个里程碑及T01–T35共35个Issues已建立；看板 https://github.com/users/olly888/projects/1 已创建、35项已导入，Private已通过设置页面和CLI双重核实。用户已恢复CLI登录并验证账号olly888；正在完成标签与初始状态校准。正常Git推送与远程Actions实际结果随后补记。
