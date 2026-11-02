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

2026-10-31多图中断批次：不新增依赖、原生模块、权限、API或迁移。复用Expo OCR桥接；JS等待60秒开发保护与串行原生槽位，取消不声称硬终止Vision/ML Kit。迟到结果忽略，真实任务结束前不并发重试；字段仍主动保存到现有加密批次。CPU/耗电/设备时限待现场冻结。


2026-10-31解锁补验修正：无新增依赖、原生模块、权限或DDL。ImportBatch.candidate_count明确为非removed候选；源契约和生成类型同步，返回选图页刷新草稿。复用既有Debug原生OCR执行实际TEST多图/进程恢复，不将JS热更新当作重新原生编译。


2026-10-31截图简洁交互：无新增依赖、字体、原生模块、系统权限或API/数据库变动；使用既有原生Alert菜单和V3组件，iOS/Android既有Debug接收JS更新。不能把本批JS导出或网页原型当作新原生编译/完整双端验收。

2026-10-31双端补验：无依赖、锁文件、原生模块、API、DDL或系统权限变动。临时连接错误保留并遮挡同账号导入内存，明确账号/权限错误仍清理；结果页控件精简。故障注入仅暂停本地API或暂时损坏自建TEST缓存副本并恢复，不改系统网络和相册原图。

2026-10-31 首页自动查码：无新增依赖、锁文件或系统权限。既有 Android AbasongLocation 扩展前台连续 LocationManager 事件，后台/销毁清理；实际 Debug 重编译安装通过。iOS 复用 expo-location58 watchPositionAsync；双端查找串行、两秒启动下限，8秒停留/20秒新鲜度为待现场冻结的开发保护。Mapbox 使用 moveTo 显式立即相机命令，避免布局更新中断缩放。新增0005入口到达区域与本地验证，不改云或默认自动认定开关。


2026-10-31 建筑门牌/尺度：明确固定 Mapbox light-v11 样式URL，复用其 composite/Streets v8 housenum_label，不新增逐建筑搜索请求或自建门牌数据源。继续 rnmapbox10.3.16 的 existing VectorSource、SymbolLayer、Fill/Line 和原生英制比例尺；自选公寓按 Mercator/512逻辑像素视野适配、最大zoom18，手动最大20。无新增依赖/锁文件/原生权限，本批为JS更新与双平台导出/现有原生运行，不称重新原生编译。公开Tilequery仅作有界覆盖诊断，不持久化供应商几何或用户位置。

2026-10-31 Mapbox Search Box：通过既有Nest/Node fetch接suggest/retrieve，无新依赖或原生重编译。公开token仅本机.env；临时数据不入永久库，路由只传内存交接键。地址身份规范化共享在contracts；无DDL/云改动。生产多实例需集中限流和会话设计，本批单进程保护仅开发环境。

## 2026-10-31 拍面单查地址

复用已锁定的 Expo58.0.21、expo-image-picker58.0.10、expo-file-system58.0.13及现有 Apple Vision/ML Kit 本地模块，无新依赖或锁版本变化。image-picker cameraPermission由禁用改为明确中文用途；microphonePermission仍false，Android合并Manifest只新增所需CAMERA而无RECORD_AUDIO。需重新prebuild、锁定Pods安装及双端原生编译；不能只热刷新。原生OCR模块常量addressCameraVersion=1用于旧包保护；iOS显式照片方向、Android旋转后文字坐标归一化。签名团队只从既有本机产物读取，不写入公共配置。

本批按安装版本阅读[Expo58 ImagePicker](https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/)、[FileSystem](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/)和Apple Vision方向初始化文档。系统相机/强杀恢复/照片缓存与JS合成状态的验收分开记录。

## 2026-11-01 公开入口核对图

未新增应用运行依赖。离线SVG图生成只用Python标准库；PNG预览可选使用本机既有Pillow12.1.1，缺失时不要求安装，产物与脚本不进入移动端包。停留修正使用已有前台位置观测和纯TypeScript距离计算；无新原生API、位置权限或后台采集。

## 2026-11-01 独立 iPhone 入口核对版

无新增依赖、锁文件或后台权限。复用已锁 Expo58.0.21 / rnmapbox10.3.16 / expo-location58.0.20，本地Release与独立registerRootComponent入口打包公开Woodside资料；普通Expo Router入口不变。独立bundle ID/scheme避免覆盖业务开发版；构建时不加载业务API/Auth模块，结束恢复普通原生配置。Expo58 prebuild必须显式`--no-clean`保留Pods；首轮误清生成目录后已按审查锁文件执行Pods部署安装恢复，没有升级。实际证据见[独立现场版方案](docs/technical/D1_独立现场版与HTTPS测试环境方案.md)。AWS北加州/KMS仍为既有部署方向，未创建资源；不以免费休眠服务或公网隧道替代现场查码就绪条件。

2026-11-01 ADD-18 nearby carousel: no new dependency/native module. Reuse Nest/pg/zod/Node24 fetch, existing RN ScrollView and Mapbox. Separate catalog and bounded temporary Tilequery/reverse enrichment; explicitly configured permanent Geocoding v6 is required for new stored coordinates. Public sample entitlement tested and enabled only in ignored local.env; sample default false. No persistent storage of temporary provider responses, cloud change or new native compile. Caption accessibility follows [React Native0.88](https://reactnative.dev/docs/accessibility), runtime remains [Expo58](https://docs.expo.dev/versions/v58.0.0/).

2026-11-01 follow-up: no dependency/native module changes. Native carousel now handles touch, Android post-release snapping and wheel scrolling using existing ScrollView events; pure event-order regressions guard programmatic remounts. Discovery tolerates fresh <=15m drift without confirming arrival and uses conservative boundary-distance radius checks. Mapbox trial entitlement correction: local permanent geocoding disabled after console/style401 checks; earlier200 responses were insufficient. No paid-plan change. See Mapbox development cost note before restoring service.


2026-11-01 ADD-19 本人共享管理：无新依赖、锁文件、原生模块或系统权限。复用Expo58/React Native0.88、现有加密与pg事务；新增0008仅本机D0/一次性库。纠正返回用既有Expo Router dismissTo和非敏感revision刷新“我共享的”；effect重建取消令牌避免开发刷新遗留aborted状态。双端现有原生包接收JS，不声称本批重新原生编译。原生功能验证与Mapbox401、物理设备/现场分开。
