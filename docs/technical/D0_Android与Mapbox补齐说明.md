# D0 · Android 与 Mapbox 补齐

日期：2026-10-29（America/Los_Angeles）。用户已取消强制 gstack 要求，并明确亲自阅读、接受 Android SDK 许可，授权继续安装。Mapbox账号由用户注册，公开token已配置并完成双端底图验证。

## 分工和未完成原因

上一轮按用户“token 暂未准备，先完成其他工程验证”的要求执行，没有可用 Mapbox 凭据，因此仅完成 SDK 编译和无地图空状态启动。Android 缺少 JDK/SDK，且当时尚无用户接受 Google SDK 许可的记录，因而明确保留该平台的编译验证，没有当作通过。

现在补齐工具链和真实地图后，再收口 D0 并进入 D1；可准备 D1 的模块实现，但不能将缺少地图凭据的验证写成通过。

## Android

- JDK：Homebrew OpenJDK17.0.21.0.3，实际 java 运行通过。未添加系统 JDK 软链接，未修改 shell 启动文件。
- Gradle：项目 wrapper9.4.1，实际 --version 通过。
- Android 官方 ARM64 Command Line Tools：15859902，归档 SHA256 `835b62a26162b229b441d1f6d4680383815a270809eb33522c0d480fa5002c4e`，已校验。
- 已安装：Platform37.0 revision2、Build Tools37.0.0、Platform Tools37.0.1、NDK27.1.12297006、CMake3.22.1。
- 仓库 SDK 包名为 `platforms;android-37.0`，保留模板 compileSdk37，不通过降低版本绕过。
- ARM64 Debug原生编译成功（5m11s，485项任务）；APK安装、Android17/API37模拟器启动和真实底图渲染通过。
- 实际解析 Mapbox Android SDK：11.33.0（android-ndk27）；iOS SDK：11.33.1。

SDK、Gradle缓存和模拟器资料使用忽略的 `.tooling/`。入口 `./scripts/android`，支持 gradle/sdk/adb/avd/emulator，使用项目范围的环境变量。用户已接受对应 SDK 条款；不将此授权扩大到其他账号、付费服务或未来不同许可。

## Mapbox

1. 使用目的建议选商业，因为 Abasong 是面向司机/DSP 的产品；这是对实际用途的判断，与目前是否盈利无关。
2. 账号由用户持有，用户完成注册、邮箱验证及条款/付款确认。项目配置、访问验证及原生集成由开发执行。
3. 如果页面提供不绑卡试用，可先使用试用，不自动升级付费账户。试用仅一个 token 时先用该公开 token；后续标准账号再按环境拆分。
4. 客户端仅使用 `pk.` 公开 token，保存到 `apps/mobile/.env.local` 的 `EXPO_PUBLIC_MAPBOX_TOKEN`。不保存 secret token 到客户端。
5. 原生 Maps SDK 不适用网站 URL 限制。之前“受限公开 token”的说法在此收窄为必要公开权限、按环境划分，不要求添加网站来源限制。
6. `./scripts/dev mapbox:check` 不输出 token，只检查配置和样式读取权限；这不是原生地图验收。
7. 真正验收需重新构建/加载带配置的原生应用，观察洛杉矶底图与缩放、移动；验证错误 token/网络异常状态。前台定位、位置质量、公寓匹配属于 D1 的业务实现及设备测试。

官方依据：[Mapbox注册与试用](https://docs.mapbox.com/accounts/guides/demo-access/)、[token与移动端URL限制](https://docs.mapbox.com/accounts/guides/tokens/)、[Android下载与许可](https://developer.android.com/studio)、[AGP9.2兼容表](https://developer.android.com/build/releases/agp-9-2-0-release-notes)。

## 公开token接入进展

用户已提供公开token；已保存到忽略的本机配置，未写入源码或文档。Mapbox官方样式读取成功。随后已实际完成iOS Release重新构建/安装/启动，及Android Debug安装/启动；两端均渲染洛杉矶真实底图。Android拖动后视野变化已观察。双击缩放曾发出操作但未取得明确视野变化证据，不单独计为通过。

截图：[iOS底图](evidence/D0_iOS_Mapbox.png)、[Android底图](evidence/D0_Android_Mapbox.png)。iOS时钟/网络覆盖层、Android开发工具按钮属于模拟器/开发构建，不是产品设计。

D0结论：此前两项前置已补齐，可以进入D1。D1继续实现认证/对象权限、前台定位与公寓匹配、密码读取/贡献/反馈；完整交互、弱网/错误token恢复、真机现场及发布不包含在本次D0验收内。
