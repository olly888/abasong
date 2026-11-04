# Abasong

[GitHub仓库](https://github.com/olly888/abasong) · [开发任务](https://github.com/olly888/abasong/issues) · [里程碑](https://github.com/olly888/abasong/milestones) · [项目看板（需权限）](https://github.com/users/olly888/projects/1) · [自动检查](https://github.com/olly888/abasong/actions)


V12.1 临时配送支援与公寓进入信息协作应用。产品基线见 [产品基线](产品基线.md)，工程进度见 [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md)。

## 本地启动

要求 Node 24.22.1、pnpm 10.32.1、Docker/OrbStack。项目包装脚本优先使用本机已有的 Node 24，不修改全局运行时。

```sh
./scripts/dev install --frozen-lockfile
./scripts/dev env:init
./scripts/dev db:up
./scripts/dev db:verify
./scripts/dev check
./scripts/dev smoke:services
./scripts/dev dev:api
# 另一个终端
./scripts/dev dev:worker
```

API 默认仅监听 `127.0.0.1:3001`。`/health/live` 检查进程，`/health/ready` 检查实际数据库连接和迁移版本。已实现身份、私人公寓库、手动贡献与受控密码读取/反馈的一部分业务接口，范围及待办见 docs/technical/D1_私人公寓与共享接口验证.md。worker 当前仅验证连接，不消费或确认业务事件。

`env:init` 保留已有配置，首次生成独立随机凭据；`db:verify` 仅允许本机 `127.0.0.1:54329` 的 D0 数据库。它创建 `abasong_d0`，保留镜像自带的 `abasong_local`，迁移后配置 API/worker 独立账号，并在回滚事务内验证约束与权限。不要把云端连接串用于这些命令。

`db:down` 停止服务，保留数据卷；不提供自动清库命令。`.env` 不提交 Git。

## 移动端

使用 Expo development build，Mapbox 不支持用 Expo Go 验收。

```sh
./scripts/dev --filter @abasong/mobile prebuild
# macOS 上安装原生依赖后编译
./scripts/dev --filter @abasong/mobile pods:install
./scripts/dev --filter @abasong/mobile ios
# Android 需先准备 JDK 和 SDK
./scripts/dev --filter @abasong/mobile android
```

地图账号准备好后，将公开 token 写入 `apps/mobile/.env.local` 的 `EXPO_PUBLIC_MAPBOX_TOKEN`。公开 token 会进入客户端包，不能用 secret token。没有 token 时显示地图不可用状态，不生成模拟地图。当前 D0 壳只有导航和空状态，业务页面按已确认原型逐阶段实现。

移动端模拟器访问宿主 API：iOS 使用 `127.0.0.1`，Android Emulator 使用 `10.0.2.2`；真实设备需另行配置开发网络和 API 监听范围，D0 不自动向局域网开放服务。

## 代码与验证

- `apps/mobile`：Expo Router / React Native / 原生 Mapbox。
- `apps/api`：NestJS API。
- `apps/worker`：独立后台进程。
- `packages/contracts`：从 OpenAPI 生成的 TypeScript 类型。
- `packages/ui`：从 V3 设计令牌生成的共享值。
- `database/migrations`：数据库迁移，云端未应用。
- `.github/workflows/ci.yml`：检查、构建、本地数据库和打包验证，不部署。

```sh
./scripts/dev contracts:generate
./scripts/dev tokens:generate
./scripts/dev --filter @abasong/mobile exec expo install --check
```

生成文件必须与源契约/令牌一同更新。具体版本及限制见 [dependency-lock.md](dependency-lock.md)。

## Android 工具链补齐

`./scripts/android` 使用项目范围的 JAVA_HOME/ANDROID_HOME 和 Gradle 缓存，不改 shell 启动文件。默认 JDK 为 Homebrew openjdk@17，SDK 为忽略的 `.tooling/android-sdk`；可用 ABASONG_JAVA_HOME / ABASONG_ANDROID_HOME 覆盖。

```sh
./scripts/android gradle --version
./scripts/android sdk --list_installed
./scripts/android gradle :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --console=plain
./scripts/dev mapbox:check
```

Google API37 的当前 SDK 包名为 `platforms;android-37.0`。Mapbox 原生 SDK 的公开 token 不使用网站 URL 限制；检查脚本只验证样式权限，不代替原生底图和定位验收。账号注册和邮箱/付款/条款由账号所有人完成。

## D1 内部排序验证

```sh
./scripts/dev verify:access-ranking
```

需先完成本地数据库初始化；用回滚事务执行真实SQL的16个排序场景，不读取密码。当前仅内部查询，尚无公寓密码HTTP接口，完整进度见 [D1开发记录](docs/technical/D1_公寓闭环开发记录.md)。

## 原生实时预览

分别在三个终端运行 `./scripts/dev preview:native`、`./scripts/dev preview:ios`、`./scripts/dev preview:android`。开发服务保持运行，两端随页面代码更新。详细步骤及重建方式见 [原生实时预览使用说明](docs/technical/原生实时预览使用说明.md)。

## D1 账号接口验证

`./scripts/dev verify:auth-api` 在本机创建独立临时测试库，用真实签名/JWKS和HTTP请求验证身份、账号与幂等逻辑，结束后仅销毁该测试库。不会连接云数据库或发送短信。详见 [身份与账号验证记录](docs/technical/D1_身份与账号接口验证.md)。

## D1 私人资料本地运行

`./scripts/dev db:verify`应用0001/0002到隔离D0并检查47表。随后运行`./scripts/dev data:init-local`，生成专用本地敏感服务连接和本地加密密钥（保留已有密钥），再启动/重启API。`./scripts/dev verify:library-api`在一次性本地数据库执行HTTP/密文/双账号权限测试。生产KMS未实现，本地加密适配器不能用于生产；不要自行替换已有LOCAL_DATA_KEK，否则已有密文无法读取。

原生首页提供搜索入口，我的提供主要贡献与我的公寓；已登录正常账号可管理私人记录，共享读/写还需审核资格。云端未应用业务迁移。无授权公寓样本时搜索为空，不注入合成公开密码。截图OCR、纠正/统计、定位卡片完整接入仍待后续。
