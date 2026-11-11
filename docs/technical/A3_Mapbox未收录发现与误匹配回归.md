# A3 Mapbox未收录发现与误匹配回归

2026-11-02，父基线`d2b72cd`／CI41558801166通过，批次`codex/d1-public-match-expansion`。用户继续暂缓云部署，并询问为何Mapbox已提供地址/分类还需要公开样本。本批将重点明确为验证Mapbox到业务资料的关联，而非扩大手工运行目录。

## 分工和实际变化

- Mapbox承担底图、建筑分类、门牌标注、地址搜索和解析。公开样本用于核对接口与关联是否正确；不是地区白名单，也不是先把公寓收录后才能显示卡片。
- Abasong保留实际贡献/收藏/反馈及密码范围需要的业务ID与许可允许的地址锚点。未登记公寓可显示临时地址卡；无明确地址先核对，不借最近目录公寓密码。供应商临时结果不整批落库。
- 官方数据模型将building、housenum_label、地址编码分开提供；建筑类别可能笼统或缺失，不能从完整地址推断一定为公寓，也不能从apartments推断必定有门禁。此为数据模型边界，不代表所有公寓都缺资料。
- 已有生产发现路径支持目录为空时Mapbox出卡；本批新增回归证明它，不宣称这是新开发出的功能。没有新增产品页面、运行公寓、边界或生产逻辑。

## 新增验证

| 场景 | 实际验证 |
|---|---|
| Abasong目录为空 | Mapbox分类候选返回临时地址卡，无需业务公寓ID、共享查看资格或永久编码；不调用读取/贡献服务 |
| 未收录相邻地址 | 同一街道100/102的合成供应商候选保持两张卡，不提前绑定目录或密码 |
| 同址多个屋顶 | 未登记地址合并为一张临时卡，不自动注册；保持原反向查询预算 |
| 6处公开地址 | 全写/缩写查询各自匹配原业务ID；测试位置由已有许可数据产生，不是司机GPS或实时Mapbox响应 |
| 相邻错门牌 | 原6处各把门牌加1作为明确错误测试输入，均不匹配原公寓；不声称这些变造地址是已验证邻居 |
| 5处方向冲突 | 将公开地址E/W/S/N反向后不匹配原公寓，不能靠近邻坐标消除方向差异 |
| 市政负例 | Pasadena City Hall公开地址不能在公寓样本位置被最近邻匹配成公寓 |

`./scripts/dev check`：239测试／43文件、lint、workspace/脚本类型、构建通过。`./scripts/dev verify:library-api`：291项真实HTTP/隔离PG检查通过，空间生产服务/PostGIS套件由79增至97组，地址匹配8组及来源/KMS合成网关+真实PG回归通过。源契约和移动实现未改，不重复JS/原生编译或用户手势；最终远程CI以对应D1集成提交为准。

## 资料检查与边界

核对Acappella、AVA及Avalon Pasadena的物业官网地址；原有12地址题库保持不变。尝试一次Pasadena较大OSM范围请求返回400，缩小后两处公开区域返回200；未得到对所选目标足够明确的新建筑关联，原始响应只留忽略目录，没有猜最近轮廓、复制居民/贡献者标签或新增运行数据。停止进一步几何采集，本批只复用现有许可夹具。未调用Nominatim或实时Mapbox业务API；没有创建新的地图服务依赖。

真实Mapbox分类/联想/反向地址关联、未知地址贡献的永久许可，以及iPhone现场仍待服务恢复。OSM观察不等于Mapbox现行瓦片，供应商测试替身不等于实时覆盖。没有账号提权、真实密码或个人位置提交，没有云资源、迁移、DNS或计费操作。当前无需用户重复iPhone手势。

## 官方参考

- [Mapbox Streets v8 building和门牌图层](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/)：分类与门牌分别存在，字段覆盖随来源而异。
- [Geocoding API](https://docs.mapbox.com/api/search/geocoding/)：地址正反向解析，不提供公寓密码资料。
- [Tilequery](https://docs.mapbox.com/api/maps/tilequery/)：附近要素查询、距离排序、最多50条限制。
- [Acappella物业地址](https://www.equityapartments.com/los-angeles/pasadena/acappella-pasadena-apartments)、[AVA物业地址](https://www.avaloncommunities.com/california/pasadena-apartments/ava-pasadena/)、[Avalon Pasadena物业地址](https://www.avaloncommunities.com/california/pasadena-apartments/avalon-pasadena/)。
