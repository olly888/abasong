# D0 依赖与运行时基线

记录日期：2026-10-29。精确 JavaScript 解析以 `pnpm-lock.yaml` 为准，直接依赖使用精确版本。升级必须重跑工程检查、数据库验证和原生构建。

| 层 | 已使用版本 | 决策 |
| --- | --- | --- |
| Node | 24.22.1 | 通过 scripts/dev 使用已有 LTS，避开本机全局 Node 25 |
| pnpm | 10.32.1 | 根 packageManager 固定，单一锁文件 |
| TypeScript | 根 5.9.3；mobile 6.0.3 | OpenAPI 类型生成器支持 TS5；移动端沿用 Expo58 官方模板版本 |
| Expo | 58.0.21 | development build，Expo Go 不用于 Mapbox 验证 |
| React / React Native | 19.3.0 / 0.88.1 | 与 Expo58 官方模板一致 |
| Expo Router | 58.0.28 | 三导航原生应用壳 |
| RNMapbox | 10.3.16 | 社区封装，实际 iOS 原生编译通过 |
| Mapbox iOS SDK | 11.33.1 | CocoaPods 实际解析，native-locks/Podfile.lock 保留 |
| Mapbox Android SDK | wrapper 默认 11.33.0 | 未完成 Android 原生解析/编译，不作为已验证版本 |
| CocoaPods | 1.16.2 | 本机安装成功；pods:install 恢复锁并 --deployment |
| NestJS | 12.3.2 | 模块化 API 初始壳，实际健康检查通过 |
| pg | 8.23.1 | API/worker 独立连接账号 |
| ESLint / Vitest | 10.13.0 / 5.0.5 | 代码检查及防误连测试 |
| PostgreSQL / PostGIS | 17.5 / 3.5.2 | 隔离本地兼容验证镜像；云端生产版本另行审查 |
| Xcode | 27.1 (27A9275) | 用户已完成许可处理，iOS27.1 模拟器编译成功 |

Docker 镜像固定：`postgis/postgis:17-3.5@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6`。本机为 Apple Silicon，镜像明确指定 linux/amd64，由 OrbStack 运行。不要将本地镜像版本视为生产托管数据库选型。

`apps/mobile/ios` 与 `android` 由 Expo prebuild 生成，不提交。iOS 原生依赖锁单独保留在 `apps/mobile/native-locks/Podfile.lock`；重新生成后运行 `pods:install`。升级涉及 Podfile 配置时，应明确审查并更新该锁，不能绕过 --deployment 当作冻结构建通过。

Android JDK/SDK 尚未安装，因此没有 Gradle 依赖锁和原生编译证据。iOS/Android JavaScript 打包不等于两端原生验收。Mapbox public token 未配置，真实地图/定位/公寓匹配尚未验证。

官方依据：[Expo58 SDK](https://docs.expo.dev/versions/v58.0.0/)、[Expo Router 安装](https://docs.expo.dev/router/installation/)、[RNMapbox 安装](https://rnmapbox.github.io/docs/install)。Expo 模块版本另通过 SDK 的 bundledNativeModules 和 expo install --check 核对。
