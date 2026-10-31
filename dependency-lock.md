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
| Mapbox Android SDK | wrapper 默认 11.33.0 | Gradle实际解析 android-ndk27:11.33.0，ARM64 Debug构建/启动通过 |
| CocoaPods | 1.16.2 | 本机安装成功；pods:install 恢复锁并 --deployment |
| NestJS | 12.3.2 | 模块化 API 初始壳，实际健康检查通过 |
| pg | 8.23.1 | API/worker 独立连接账号 |
| ESLint / Vitest | 10.13.0 / 5.0.5 | 代码检查及防误连测试 |
| PostgreSQL / PostGIS | 17.5 / 3.5.2 | 隔离本地兼容验证镜像；云端生产版本另行审查 |
| Xcode | 27.1 (27A9275) | 用户已完成许可处理，iOS27.1 模拟器编译成功 |

Docker 镜像固定：`postgis/postgis:17-3.5@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6`。本机为 Apple Silicon，镜像明确指定 linux/amd64，由 OrbStack 运行。不要将本地镜像版本视为生产托管数据库选型。

`apps/mobile/ios` 与 `android` 由 Expo prebuild 生成，不提交。iOS 原生依赖锁单独保留在 `apps/mobile/native-locks/Podfile.lock`；重新生成后运行 `pods:install`。升级涉及 Podfile 配置时，应明确审查并更新该锁，不能绕过 --deployment 当作冻结构建通过。

Android工具链已于后续补齐：OpenJDK17.0.21.0.3、Gradle9.4.1、Platform37.0 revision2、Build Tools37.0.0、Platform Tools37.0.1、NDK27.1.12297006、CMake3.22.1、Emulator37.2.13；原生编译/启动结果见D0补齐说明。iOS/Android JavaScript 打包不等于两端原生验收。Mapbox公开token已在本机配置，双端真实底图已验证；定位/公寓匹配属于后续D1。构建APK与模拟器镜像仅保存在忽略目录，不提交公开token或编译产物。

官方依据：[Expo58 SDK](https://docs.expo.dev/versions/v58.0.0/)、[Expo Router 安装](https://docs.expo.dev/router/installation/)、[RNMapbox 安装](https://rnmapbox.github.io/docs/install)。Expo 模块版本另通过 SDK 的 bundledNativeModules 和 expo install --check 核对。

实时预览补充：react-native-web0.21.4（Expo兼容版本），Web预览独立包使用mapbox-gl3.34.1；与原生RNMapbox的可选Web peer隔离，原生地图实现保持不变。scrcpy5.0.1用于Android实时画面。共享包类型入口指向源文件，使全新检出在生成dist之前也能做类型检查。

D1账号接口：jose6.2.14、zod4.6.7、@types/express5.0.6。契约包使用dist声明入口，根typecheck先构建契约。Node24实际执行ESM jose验证通过；没有自行实现JWT密码学。

D1原生登录：@supabase/supabase-js2.118.0、expo-secure-store58.0.2、expo-crypto58.0.7、react-native-url-polyfill4.0.0、libphonenumber-js1.13.15，均固定直接版本。原生模块新增后已重新prebuild、更新并审查Podfile.lock；双平台原生Debug编译通过。SecureStore使用设备安全存储，无明文回退；Web只用内存。SDK2.118.0已内置会话刷新协调，移除其已弃用的processLock选项。Prettier3.9.10仅用于开发格式化。类型路由在mobile typecheck前通过Expo官方customize命令生成；不提交生成缓存。

区域配置决策（2026-10-30）：用户实际创建AbasongDevWest于us-west-1（北加州）。本地配置已切换，未来API/worker/KMS计划同区；此前us-west-2为部署草案，未创建资源。旧美东项目保留，不将更换项目URL描述为原项目数据迁移。

2026-10-30 D1 private data: no new runtime packages. Local envelope uses Node24 built-in crypto (AES-256-GCM, HKDF, HMAC), zod/pg/Nest already locked. Test provider uses existing jose/pg; schema validation reuses isolated /private/tmp/abasong-v12-validation dependencies. No KMS/OCR dependency selected or installed; local adapter cannot be enabled in production. Dedicated local DB credential/KEK stays ignored0600.

2026-10-30 GitHub history audit: Gitleaks v8.30.1 official vendor binary, release checksum verified, installed only in ignored .tooling/security. CI installer pins this version and checks vendor SHA256 before extraction. Apple Vision and existing pdftotext used offline for28 visual/PDF history versions. No new application dependencies or package-lock changes.

2026-10-30 D1 location: reuses locked expo-location58.0.20 / rnmapbox10.3.16 / PostGIS, no new package or lockfile changes. Versioned candidate limits required; production auto-match remains off pending T23. Vitest5 source-only discovery configured to exclude compiled duplicate suites on repeat checks.

2026-10-30 native visual alignment: no added packages/fonts/native modules; outline icons use native views, V3 shared tokens reused. Existing rnmapbox10.3.16 Light basemap with required attribution retained.

2026-10-30 screenshot import: Expo58官方兼容安装后固定 expo-image-picker58.0.10、expo-file-system58.0.13；pnpm主锁与审查后的Podfile.lock同步。新增本地Expo模块AbasongOcr0.1.0：iOS Apple Vision系统框架，Android Google Maven随包Latin文本识别com.google.mlkit:text-recognition16.0.1。原图不发往云端OCR，单张串行且限制文件/像素/行数；模型输出仅是待核对文本。Android依赖由Gradle解析，后续升级须复跑双平台原生及识别样本。未选择云端OCR供应商、未增加商业账号或上传真实截图。新增原生模块已触发双平台Debug重编译，详细验收以本批记录为准。

2026-10-30 首页定位修正：未改变外部依赖版本或主锁。Expo58旧Android定位及内置next系统路径在default镜像未获得样本，未保留beta next API。最终新增本地Android专用AbasongLocation0.1.0，通过现有AndroidX/系统LocationManager兼容接口请求GPS单次位置；仅粗略权限时不使用GPS。显式15秒取消、前后台/销毁/Abort清理，无新增系统权限/后台服务/GMS。Android实际重编译安装，合成GPS和用户回位补验通过；iOS仍用expo-location58.0.20，JS相机修正与用户回位补验通过。升级必须复跑提供者、权限、取消、旧位置与设备场景。expo-dev-client58.0.17现有setToolsButtonVisible(false)隐藏开发齿轮，保留开发菜单快捷方式。


2026-10-30 D1真实定位/建筑首批：不增加依赖或权限，复用expo-location58与已有Android前台单次定位模块串行刷新；rnmapbox10.3.16现有ShapeSource/FillLayer/LineLayer/SymbolLayer绘制经核对几何。刷新5秒/停留8秒仅开发保护，等待现场参数冻结；不启用beta定位API或后台服务。Mapbox临时样本请求只记录覆盖统计，不存供应商返回坐标/轮廓。0003新增独立建筑映射，截图批次迁移顺延0004。


2026-10-30真实公寓/端侧批次：不新增依赖或原生权限，继续Node24/pnpm10.32.1与现有Expo/Mapbox/OCR模块。新增独立ODbL公开几何样本及归属说明，非Mapbox临时结果存库，不新增App运行时OSM请求。新0004/50表、15个本地端侧批次操作、源状态registered、ImportScope仅label、逐项稳定提交ID与owner加密结果；云OCR/上传三操作继续planned。API JSON体上限调整为128KiB（仅批次JSON，其他接口仍16KiB），DTO/100候选/10图等开发策略另行限额，图片不走此JSON接口。worker仅新增受限过期函数调用；生产KMS/云配置未变。

2026-10-30洛杉矶扩充/弱网批次：无新增依赖、原生模块、权限或数据库迁移。复用现有PostGIS geography距离判断精度范围相交，既有信封加密/幂等重放；新增5个ODbL公开地址样本，总6处，来源-only与建筑轮廓严格区分。端侧超时10秒和取消独立，不自动重复写；默认自动认定及云配置未变。
