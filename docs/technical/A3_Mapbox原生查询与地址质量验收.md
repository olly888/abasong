# A3 Mapbox原生查询与地址质量验收

2026-11-02，基于D1集成`9ddfbb7`，批次分支`codex/d1-mapbox-native-quality`。用户继续暂缓云部署。本批保持200米附近发现、紧凑独立滑卡与当前视觉；不新增400米模式、入口预览或业务页面。

## 最终行为

### 原生建筑直接查询

原生HomeMap使用已安装`@rnmapbox/maps 10.3.16`的`querySourceFeatures`读取当前已加载`composite/building`图形。选中的临时候选优先按同一供应商建筑ID定位；没有ID时仅接受唯一包含候选点的轮廓。不存在、重叠歧义、无效坐标、退化环、建筑部分或尚未加载时不猜另一屋顶。已核对的Abasong建筑几何优先；普通门牌图层保留，不把一个社区主门牌套到所有屋顶。

点建筑使用`queryRenderedFeaturesAtPoint`，只从当前已发现候选中匹配唯一对象，再复用现有选卡、密码读取和阅读锁。没有唯一候选则保留当前卡，不通过屋顶点击创建地址或读取其他密码。切卡、清除、卸载使旧查询失效；仅一条查询在途，最近请求覆盖排队项，最短间隔250毫秒。相同图形结果不重复更新ShapeSource，避免idle/重绘循环。屏幕查询的迟到结果还须通过当前选择与候选快照检查。

供应商图形仅在内存中用于当前会话；限制要素和坐标数量，移除供应商属性，不上传、日志输出或存库。新增可选响应字段`NearbyCandidate.provider_feature_id`（最长200）仅辅助选中，不是Abasong公寓ID、地址证明或持久化许可；提交DTO仍不能传入该字段。已加载瓦片查询不替代服务端200米发现，更不承诺整个地图目录完整。

### 达到上限的有限补查

初始200米Tilequery不足50条时仍只查询一次；恰好50条时，最多并行查询四个方向100米偏移、150米半径。总上限5次Tilequery，之后反向地址建议仍最多4次：一次发现最多9次供应商HTTP，未截断时最多5次。保留现有每账号25秒及全局1秒发现预算；没有后台批量爬取或无限补查。

只接受`apartments`，按原观测点距离去重排序，排除200米外结果。偏移查询的distance不能冒充距司机距离，补查使用原点到返回最近点的球面距离上界，可能保守漏掉边缘建筑。初始达到50条始终保留`truncated=true`，即使补查成功也不宣称完整覆盖；部分补查失败保留成功部分，首查失败不扇出。已收录资料查码不因供应商补查失败中断。

### 新地址永久绑定质量

Geocoding v6正向请求改用官方`q`参数，包含司机核对的完整地址，`types=address`、美国、`autocomplete=false`、`permanent=true`。永久配置默认关闭，资格不足仍明确失败并保留输入。

首次保存要求：规范门牌/街道/城市/州一致，填写ZIP时也须一致；坐标accuracy为`rooftop/parcel/point`，正向`match_code`为`exact/high`且门牌、街道、州逐项matched。精度插值、approximate、缺失质量、低置信度或供应商纠正任一关键组件时返回既有409地址核对状态，不自动共享到猜测地址。这里只约束新地址绑定，不新增贡献人工审核，不改变已明确收录地址直接共享。

Search Box和反向编码不提供同等正向match_code，仍只是临时建议，不能伪造质量。精确地址匹配和高亮不代表已核对配送入口或门禁适用范围。

## 实际验证

- `./scripts/dev check`：236项测试／43文件、lint、workspace/脚本类型、API/worker构建通过。新增供应商补查、首查失败预算、偏移距离、质量缺失/低置信度/关键组件拒绝，以及原生Polygon/MultiPolygon、庭院洞、边界、歧义、重复瓦片、无效/退化图形、唯一选卡测试。
- `./scripts/dev verify:library-api`：291项真实HTTP/隔离PostgreSQL检查；地址匹配8组、空间覆盖79组、来源管理及合成KMS网关＋真实PG回归通过。
- `./scripts/dev verify:import-api`：124项隔离HTTP/数据库检查通过；预期故障注入日志不作为产品异常隐藏。
- OpenAPI源/生成类型同步，静态规范/SQL顶层解析/页面引用/本地文档链接和生成可重复性单独检查；没有新迁移、表、包或原生依赖。
- iOS、Android、Web JavaScript导出通过；不是重新原生编译。
- 双端原生开发构建 `/design-lab?case=map-query` 使用内嵌TEST GeoJSON、真实Mapbox SDK查询：100→102切换、点另一栋建筑同步选择、高亮移除后不残留均已观察。SDK返回同栋多个瓦片片段，测试文本明确按“图形片段”计数，不冒称多处公寓。
- iOS首次冷启停在开发服务选择，连接现有localhost后进入本批页面；Android镜像点击需要较长按压，后续控制窗口不稳定，已保存可见清除状态。没有要求用户重复已通过的手势。
- 忽略目录证据：`.tooling/mapbox-native-quality-acceptance/ios-selected.png`、`ios-clear.png`、`android-clear.png`。原生测试无账号提权、真实密码、真实GPS或业务提交。

## 限制与下一出口

本批没有执行实时Tilequery/永久编码业务探测或Mapbox账号/账单操作。原生SDK启动仍出现地图加载错误提示；内嵌测试图形可用于SDK方法验证，但不能证明线上样式、分类、门牌和查询资格已恢复。此前试用401问题未在本批复核关闭。云部署、DevWest业务迁移、DNS和费用继续暂缓；运行目录仍为6处，未把研究地址或临时供应商结果整批入库。

下一步先扩充有许可的边界／相邻地址与错误匹配样本，推进真实授权脱敏截图质量；Mapbox恢复后重测有限补查和新地址永久保存，再安排iPhone现场。Android真机仍待设备；本批双模拟器不能代替现场或A5蜂窝独立业务版验收。

## 官方依据

- [Mapbox Tilequery](https://docs.mapbox.com/api/maps/tilequery/)：最多50要素、返回距查询点最近的点；不能当成原始建筑轮廓或完整公寓库。
- [Mapbox Geocoding v6](https://docs.mapbox.com/api/search/geocoding/)：正向参数、accuracy及地址组件match_code。
- [RNMapbox MapView](https://rnmapbox.github.io/docs/components/MapView)：原生source/rendered查询；已核对安装版本源码。
- [Mapbox临时与永久结果](https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/)：会话与持久化分开。
