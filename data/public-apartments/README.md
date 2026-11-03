# Public pilot geometry

## Role of these fixtures

These bounded public samples are a regression/acceptance dataset, not a complete apartment address catalog or a runtime region allowlist. Mapbox discovery does not require an existing Abasong apartment or password. Unregistered classified candidates can display temporary address/confirmation cards; business IDs and licensed address anchors are created or associated only when a business flow needs them. Basemap, search and geocoding remain Mapbox capabilities. This folder is not a second citywide map-provider integration.

`one-santa-fe.geojson` contains independent OpenStreetMap way427628872 geometry, downloaded from the official OSM map API on2026-10-30. © OpenStreetMap contributors. Data available under [ODbL1.0](https://opendatacommons.org/licenses/odbl/1-0/); see [copyright and attribution](https://www.openstreetmap.org/copyright). This file and any adaptations of this geometry retain that license. The project's code license does not override this dataset license.

Canonical property name/address is cross-checked against the [property operator](https://osfla.com/). The OSM street spelling and postal code differ; that discrepancy is recorded, not silently treated as field verification. Public address association is not proof of entrance, gated-community extent, required access method or working access code.

No Mapbox temporary geocoding coordinate/result is persisted here. No personal driver location, resident data, delivery data or access information is included. Mapbox remains the basemap; this is one bounded, auditable pilot data fixture, not a second map provider runtime dependency. Shared/private access records remain separate and are not derived from OSM.

Local ingestion retains source/license provenance, geometry validation and a deterministic Abasong ID. No upstream OSM edit, cloud import or automatic-match activation occurs. True-device field acceptance remains separate. The stored polygon is a conservative building-only matching area, not a claim to cover the whole property or entrances.

## Los Angeles expansion — 2026-10-30

`la-expansion.geojson` adds five reviewed address records. With One Santa Fe there are six properties, four with conservative building-only matching geometry and two address-only entries. Park La Brea's primary address and Tower 48 are separate address scopes; they must not share an inferred community-wide code.

| Property | Public primary address | Matching geometry |
|---|---|---|
| Del Mar Apartments | 2445 E Del Mar Blvd, Pasadena, CA 91107 | OSM relation6969959; one outer ring, three courtyard holes preserved |
| Woodside Village | 2547 Temple Ave, West Covina, CA 91792 | 54 explicitly apartment-tagged footprints fully contained in OSM property way634522936 |
| Colony at The Lakes | 301 S Glendora Ave, West Covina, CA 91790 | Address-only; named property area is retained as source evidence, not a building or automatic-match boundary |
| Park La Brea | 6200 W 3rd St, Los Angeles, CA 90036 | Address-only; OSM neighbourhood way550767339 is not treated as one building or one access scope |
| Park La Brea · Tower 48 | 435 S Curson Ave, Los Angeles, CA 90036 | Explicit building/address way423469209, independently contained in the named community area |

Addresses are cross-checked against [Del Mar](https://www.delmarpasadena.com/), [Woodside](https://www.woodsidevillageapartmenthomes.com/contactus), [Colony](https://www.colonyatthelakes.com/), and [Park La Brea](https://www.parklabrea.com/). Tower 48's specific 435 address is from the explicitly tagged OSM building; the operator website confirms the community, not this tower's street number. OSM way/relation references for every saved geometry appear in each feature's `geometry_sources`. Raw contributor/user/parcel/resident tags are not copied.

Reproduction: obtain the four bounded official OSM map API responses identified by the extraction script's filenames, then run `python3 scripts/d1/extract-la-public-samples.py INPUT_DIRECTORY`. This script performs no network requests. It assembles only this reviewed subset; it intentionally rejects incomplete/unclosed rings. PostGIS ingestion independently checks validity and full property containment. Multipolygon courtyard holes are preserved. Do not reuse the script as a general OSM relation assembler.

For multi-building Woodside, 2547 is the property's primary address label, not a newly asserted individual door/building number. One aggregated MultiPolygon feature avoids repeating the primary number on all 54 footprints. No lawns, pools or parking areas enter its automatic-match boundary. Public-source checks do not prove an entry method, a working code, field GPS accuracy or universal building coverage. No runtime dependency or automatic-match activation is added.

## Gate candidates — 2026-11-01

`woodside-entrance-candidates.geojson` records two OSM gate points, both separately checked against the official API on2026-11-01: [G1 node6117285531/v2](https://www.openstreetmap.org/node/6117285531), [G2 node6117285532/v2](https://www.openstreetmap.org/node/6117285532). Their linked service ways652536537/652536538/652536539 remain v3; the shared way652536539 has `access=private`. Only selected public map tags, object versions, source references and coordinates are retained; no contributor identities or changesets. Same ODbL1.0 attribution/license as above.

They are point **candidates**, not arrival polygons, driver position or permission to enter. `field_verified=false` and unresolved pedestrian/delivery/address/range questions remain. They are not ingested by the normal apartment importer. The new HTTP regression constructs clearly synthetic8m test envelopes ONLY inside a disposable library-test database; it never imports those envelopes into D0/cloud or treats them as verified field evidence.

Render an offline operator review figure with `python3 scripts/d1/render-entrance-review.py docs/technical/figures`. SVG rendering uses the Python standard library; PNG is optional via an existing local Pillow12.1.1 installation. This rendering-only tool does not add an application runtime dependency. Building/property shapes retain the2026-10-30 snapshot; rechecking node versions does not reverify every building or the property boundary.

The separate iPhone field-review entry embeds the same licensed Woodside subset in `apps/mobile/src/field/woodside.public.json`. Regenerate with `./scripts/dev exec node scripts/field/build-review-data.mjs` or verify with `--check`. The dataset license also applies to this derived subset. It carries two unverified candidates and public footprints only; it never creates an arrival polygon or copies the primary2547 label to individual buildings. No personal location/access information or runtime OSM fetch is added. See [field plan](../../docs/technical/D1_独立现场版与HTTPS测试环境方案.md) for its limited acceptance scope.

## 2026-11-02 核对清单（不自动入库）

pilot-address-inventory.json包含12个公寓地址目标与1个市政负例；原6的许可/几何保持旧记录，新6仅有官方邮政事实、无坐标/边界，runtime_catalog=false。不是新的GeoJSON运行数据，更不含密码。详见docs/technical/A3_公开地址核对与真实截图采集.md。

## 2026-11-02 本地覆盖回归

复用现有6运行条目、其中4处建筑轮廓及Woodside54个屋顶做生产服务／PostGIS检查。外圈观测由已许可轮廓生成；长社区、相邻门牌、来源时效及无效边界使用明确TEST形状，不持久入目录。共79组场景不是79个新公寓或现场通过，新6个研究地址仍未入库。[实际范围](../../docs/technical/A3_附近公寓覆盖与匹配验收.md)。

## 2026-11-02 未收录发现与错误关联回归

复用6处运行夹具增加真实公开地址的全写/缩写、错门牌、反方向及市政地址误匹配测试，空间套件由79增至97组。新增服务测试证明：目录为空时Mapbox仍可出临时公寓卡、相邻地址不合并、同址多屋顶合并且不触发密码读取或注册。没有新增运行数据、区域白名单或现场准确率结论。详见[验收与职责说明](../../docs/technical/A3_Mapbox未收录发现与误匹配回归.md)。
