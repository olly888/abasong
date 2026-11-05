# Abasong development status

Updated2026-11-05 (America/Los_Angeles). Read [产品基线](产品基线.md), [docs index](docs/README.md), [development gate](docs/Abasong_V3.2_可开发与可验收基线.md). Previous current status preserved in the [bcfa054 snapshot](docs/archive/circle-images-20261105/工程状态_bcfa054快照.md); earlier history remains linked there.

## Current review — My menu, DSP identity and business model

2026-11-05 owner requested a detailed review. [Review proposal](docs/product/reviews/Abasong_V3.2_我的菜单与DSP身份商业模式评审.md), branch `codex/v32-my-account-review` fromce6b45d/PR82: inspected current synthetic My/profile/organization/contacts screens and actual native/API/initial models; checked official Apple/Google purchase policy. Three screenshots and a synthetic observation record accompany the proposal. No save/send/API, user contact, auth, permission, subscription or UI behavior change. Recommendations are pending decision, not new product rules or adopted G/D/UP entries. App/contract/DB/cloud and existing release gates unchanged; no full build or native test for this review-only batch.

Proposals: retain private contacts; use My Team / DSP Team Details; unified accounts with optional delivery/team purposes; voluntary contact sharing without exposing Auth phone; first release has no member joining or new DSP console; DSP subscription remains a later validation hypothesis, not an activated payment plan. Actual prior prototype evidence follows and is not reused as acceptance of these new proposals.

## Last prototype delivery — optional photos in the circle prototype

Owner approved text plus up to3 photos for the first circle release. Branch `codex/v32-circle-images`, based on `bcfa054` / PR81 (`codex/v32-driver-circle`). Documentation and independent V3.2 browser prototype only. App remains V3.1; native circle and actual media service remain pending B5. No apps/packages/OpenAPI/generator/migrations/dependencies/cloud/IAM/env/grants/SMS or real messages changed. No user photo, attachment, camera or photo library accessed.

- [Photo requirements](docs/product/Abasong_V3.2_司机圈图片发布补充.md) replace earlier no-images restriction: body required,0–3 optional ordered photos; camera/gallery target, preview/remove/reselect, compact single/multi-image feed, full-image viewer and return. Replies stay text; no video, editing suite, photo replies or automatic entrance archive/extra apartment field. Passwords stay in controlled contribution flow.
- [Interactive prototype](design/abasong-independent-v1/v12.1-experience/index.html?v=r3-images&task=circle): three original TEST SVG illustrations only. Camera/gallery, uploads, authorization and failures are synthetic memory flows, not device/HTTP tests. Partial upload/posting failures retain all fields and ready images; retry is not duplicate publication; interruption/reset/logout guard late synthetic writes. No photo is mandatory.
- [Page specifications](docs/product/Abasong_V12.1_页面功能信息与交互规格.md),39-node catalog/330 required states, [design V3.2](docs/design/Abasong_设计系统_V3.2_升级方案.md), UP14/UX12 and copy C106–C119 updated. Natural feed does not inherit192px map-card height. V3.1 token source/old prototype unchanged; no claim330 states passed, external designer sign-off or full accessibility approval.
- [D17 and B5 targets](docs/technical/V3.2_原型到代码差异与实施批次.md): private media upload/attach/read/lifecycle, ordered media_ids and ownership/read visibility/decoding/EXIF cleanup. Existing OCR import is not community image storage. New API/DDL/resources require their own implementation and validation; this batch changes none. [G01–G17 scope](docs/product/V3.2_首版需求缺口与范围裁决.md) and machine gate remain scoped/not development-ready.
- Human observation remains0/7. Original38 core records unchanged; the10 circle follow-up rows remainnot_run, T10/T11 updated to include photo publish/return. No extra participants/results or new core-preparation blocker invented.

## Executed checks and limits

[Photo report](design/abasong-independent-v1/v12.1-experience/circle-images-checks.json):17 isolated Chromium checks PASS,0 script errors/external requests. Selection order/max3, remove/reselect/cancel, synthetic camera/permission/read failure, partial upload/post failure, no duplicate or late publication, session draft/logout, viewer swipe/button/keyboard/zoom/return, thumbnail/view errors, blocked target and320/390/430 layout. Fixed48px remove target overlapping thumbnail preview on small screens; checked swipe does not trigger zoom.

Reran [19 circle checks](design/abasong-independent-v1/v12.1-experience/circle-checks.json), [34 map/warehouse checks](design/abasong-independent-v1/v12.1-experience/browser-checks.json) and [10 core checks](design/abasong-independent-v1/v12.1-experience/core-checks.json) PASS against this extension:80 total synthetic checks, not80 users. Each report has its actual timestamp; image source and screenshot evidence are local. No real upload or service authorization result is implied.

Local delivery verification PASS:10 JS syntax files and494 baseline assertions including389 local references/assets, G/D/UP/copy trace,17 real source-path tasks, catalog/CSV state consistency and38+10 unrun records. `git diff --check` clean; staged redacted secret scan recorded at delivery. Exact commit/CI tracked in draft PR; automatic workflow only targets main, so a stacked PR is not remotely green by implication. No full App build or DB/HTTP/native rerun for this docs/prototype-only batch.

Actual iOS/Android permission/picker/camera/keyboard, pinch/system gestures,200% text, screen readers, real photo readability, private storage/security and cloud delivery remain unverified. Production format rules do not accept SVG just because synthetic prototype fixtures are SVG. No extra account/cost/resource operation this batch.

## Next order

Prototype experience confirmation/R3 observation and fixes → R4 P0 card/region/camera/distance/date/pickup/regression differences → B5 minimum profiles/contacts/circle including D17 media → B6 real cloud/KMS/two-account, remote push, independent pilot/physical/field evidence. App and release gates remain unpassed; photos do not reorder core code lookup/contribution priority. [Master plan](docs/Abasong_V12.1_项目开发与验收总计划.md) is current. No iPhone action needed for this prototype batch.
