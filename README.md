# Abasong

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

API 默认仅监听 `127.0.0.1:3001`。`/health/live` 检查进程，`/health/ready` 检查实际数据库连接和迁移版本。业务接口尚未实现。worker 当前仅验证连接，不消费或确认业务事件。

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
