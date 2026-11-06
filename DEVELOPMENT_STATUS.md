# Abasong development status

Updated 2026-11-05 (America/Los_Angeles). Current sources: [product baseline](产品基线.md), [docs index](docs/README.md), [master plan1.32](docs/Abasong_V12.1_项目开发与验收总计划.md), [scoped readiness](docs/product/V3.2_开发基准状态.json). Prior current documents are [fully archived](docs/archive/app-alignment-audit-20261105/README.md).

## Current delivery — R4-01 distance contract and R4 apartment cards in progress

User authorized implementation after PR89/source audit. Working branch `codex/r4-01-distance-apartment-cards`, starting `1168328a3769777cd7f9e7870f3abb4b2d55ba4d`. Actual nearby contract/service/native components now changed; no cloud or migration/dependency/grant changes. V3.1 base remains, apartment cards are being aligned to the V3.2 target; no whole-App upgrade claim.

Implemented: optional snapshot ID on separate NearbyInput, distance basis and response snapshot validity; catalog nearest geometry basis; atomic same-origin catalog+Mapbox bundle; client expiry/drift/legacy handling; shared card surface/rail/gesture/layout; street weight/city+m/door fallback; measured adaptive height with zero-width Android guard; map scale metric; shared contribution no default door. CI PR-base filters now include codex/**. Final commit/remote CI pending.

Executed after final component and boundary fixes: full engineering check70 files/373 tests PASS plus lint/types/build; isolated local HTTP/PG suite295 and nearby coverage97 PASS; full OpenAPI spec +9 R4 checks PASS. Existing whole historical Python validator contains older messaging/public-device assumptions and is not claimed passed; no changes retained to that script. Current API source is under tsx watch; no listener/network change made.

Native iOS simulator: TEST100→102 via native accessibility action, TEST-02#, expand/collapse stays102 and read count unchanged,104 empty/add, coarse/expired and320-width long content checked. Android:192px stabilized after fixing zero-width first-pass height capture; owner explicitly confirmed102/password/expand-collapse/104-empty three items PASS. Labs are memory-only; no real contributions or qualification changes. Additional error-state/final evidence paused by Mac lock; unlock request pending, no iPhone action needed. No new native compilation, physical field or human-participant acceptance claimed.

Next finish: unlock-dependent failed/denied/final native screenshots; scan, commit/PR and exact-SHA CI. Current implementation and evidence: [R4 report](docs/technical/R4_01_距离契约与公寓卡片实施验收.md). Then R4-03 direct generic contribution form and R4-04 collaboration carousel remain queued; do not jump to B5. Prior audit/plans and historical metrics remain below for traceability, not current pass results.

## Implementation coverage and remaining deltas

| Area | Retain | Target delta |
|---|---|---|
| Apartments | Continuous foreground location,200m discovery, independent carousel, search/highlight/house numbers, read states/feedback/contribution/correction; R4 distance contract and compact shared card components | Final native failed/denied visual checks; generic direct address form R4-03. No full R4-1 exit yet |
| Collaboration | Regional map/list/filter, minimum profiles, single availability interval, version/expiry | Common three-variant carousel, region query distinct from selection, full camera memory; two-scene pickup/date/quantity semantics |
| Publish/application | Actual local services, idempotency/version/source conversation/manual close | Warehouse full address and map/copy/navigation; exact/estimated/unknown; arrival/completion/expiry separation. New contracts/migration needed, not UI-only |
| Availability | Cross-midnight conversion and disabled short-circuit already implemented | Today/tomorrow interactions, clear end-date/cancel/errors; reuse for My switch |
| Imports/correction/messages | Existing batch confirmation/retry, own correction/no normal withdrawal, message retry/read watermarks | Protect and adjust only affected target states; do not recreate services |
| My/team | Minimal display name/bootstrap, old menu and organization linkage | New My grouping/switch, profile/experience/voluntary contacts, own minimal DSP team and source snapshots |
| Circle/invite | Synthetic prototype and some old table/contract definitions | Circle native unavailable; real posts/replies/private media and invitation/share/distribution pending |

Keep default-nearby behavior without dwell/entry gates. Do not guess an entry, copy one community code across buildings, imply physical driver GPS on regional discovery, or reinstate cancelled contacts/meeting points. Door labels need explicit-versus-legacy/default handling; fallback “大门” is not evidence of user-confirmed scope.

## Prior source-audit evidence (historical)

`./scripts/dev check` PASS: lint, workspace/script typechecks,68 files/367 tests and shared-package/API/worker builds. Initial sandbox attempt failed only two HTTP tests at `listen EPERM 127.0.0.1` (365 pass); full rerun with local-listener permission passed all367 plus builds, without test changes. This is not native compilation, actual PostgreSQL execution, real Mapbox/Auth/SMS or cloud acceptance.

Documentation/task/link/JS syntax validation is recorded in [baseline report](design/abasong-independent-v1/v12.1-experience/account-baseline-checks.json). Its current scope is source audit and preparation; historical browser reports remain25 delivery+132 existing synthetic checks, not rerun or relabelled as native. No database migrations, cloud resources, qualifications or real user data changed. Human observations remain0/7,38 core+10 circle+7 account rows not_run. No iPhone action needed for this audit.

## Next execution

1. Close R4-01 exact-SHA remote CI and R4-02 final native failure/denied observations. Continue R4-03 direct contribution form, R4-04 collaboration carousel/filter/camera, then R4-05 combined iOS/Android functional and visual exit. Already confirmed Android three gestures do not need repeating.
2. R4-06–10: versioned two-scene/pickup/quantity/date contracts and incremental migration, services/application semantics, native form/preview/details/navigation, availability interaction and dual-native exit.
3. R4-11–13: protect imports/correction/application/messages and close core differences with exact evidence, then B5 profile/My→own team→circle text/replies→private images→invitation.

`development_ready=true` authorizes controlled **R4-1 implementation**; distance/card implementation has now started. It does not mean the full milestone is accepted. `b5_ready=false`, `release_ready=false`. D14 is umbrella, D22 overlaps D05/D06, D23 overlaps D01; no duplicate counts. D19 cancelled, D24 apartment list P1.7-person usability can run alongside independent local tasks; real-account/KMS/push/independent bundle/physical and field evidence remain B6, not waived or claimed complete. Follow existing issue mapping; do not bulk merge open PRs or close tasks from this audit alone.
