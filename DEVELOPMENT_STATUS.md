# Abasong development status

Updated 2026-11-05 (America/Los_Angeles). Current sources: [product baseline](产品基线.md), [docs index](docs/README.md), [master plan1.31](docs/Abasong_V12.1_项目开发与验收总计划.md), [scoped readiness](docs/product/V3.2_开发基准状态.json). Prior current documents are [fully archived](docs/archive/app-alignment-audit-20261105/README.md).

## Current result — accepted prototype, source audit and execution register

Owner reports the prototype's main experience meets expectations. Recorded as **main-flow product acceptance**, not all39 pages/387 states, new dual-native acceptance,7 human participants, or release approval. Actual App remains V3.1; V3.2 r3-delivery is the implementation target. This batch changes documentation/readiness/trace validation only; no App/API/contracts/database/cloud/grants/env/dependencies/prototype UI changes and no real messages or SMS.

Source baseline `df82aefc32bbcaef6a9671da18ad517e88c4d074`, initial worktree clean. Latest apps/packages/database/scripts business commit is `b29c1c3613051a4ad1734b73e3cf941af2ac85be`. Audit branch `codex/v32-app-alignment-audit` inherits the accepted prototype. PR88 is open/draft, based on PR87; exact-base query returned no workflow runs. Workflow currently only triggers pushes/PR bases on main, excluding the stacked codex bases; R4-01 must add project-scoped CI coverage and exact-SHA verification. No integration into main is claimed.

[Source audit and delivery sequence](docs/technical/V3.2_App对齐审查与开发任务.md), [22 work packages](docs/technical/V3.2_App对齐开发任务清单.csv), [D01–D24 mapping](docs/technical/V3.2_代码差异清单.csv), and [machine evidence](docs/technical/V3.2_App对齐审查证据.json) distinguish retained, adjusted, missing, cancelled/P1 and external work. The22 include this completed source audit1, core implementation13, B5 five and concentrated validation3, not a completion percentage or schedule estimate.

## Actual implementation facts

| Area | Retain | Target delta |
|---|---|---|
| Apartments | Continuous foreground location,200m discovery, independent carousel, search/highlight/house numbers, read states/feedback/contribution/correction | Street weight/city+m/explicit same-source door scope; distance geometry/snapshot semantics; generic direct address form |
| Collaboration | Regional map/list/filter, minimum profiles, single availability interval, version/expiry | Common three-variant carousel, region query distinct from selection, full camera memory; two-scene pickup/date/quantity semantics |
| Publish/application | Actual local services, idempotency/version/source conversation/manual close | Warehouse full address and map/copy/navigation; exact/estimated/unknown; arrival/completion/expiry separation. New contracts/migration needed, not UI-only |
| Availability | Cross-midnight conversion and disabled short-circuit already implemented | Today/tomorrow interactions, clear end-date/cancel/errors; reuse for My switch |
| Imports/correction/messages | Existing batch confirmation/retry, own correction/no normal withdrawal, message retry/read watermarks | Protect and adjust only affected target states; do not recreate services |
| My/team | Minimal display name/bootstrap, old menu and organization linkage | New My grouping/switch, profile/experience/voluntary contacts, own minimal DSP team and source snapshots |
| Circle/invite | Synthetic prototype and some old table/contract definitions | Circle native unavailable; real posts/replies/private media and invitation/share/distribution pending |

Keep default-nearby behavior without dwell/entry gates. Do not guess an entry, copy one community code across buildings, imply physical driver GPS on regional discovery, or reinstate cancelled contacts/meeting points. Door labels need explicit-versus-legacy/default handling; fallback “大门” is not evidence of user-confirmed scope.

## Executed checks and limits

`./scripts/dev check` PASS: lint, workspace/script typechecks,68 files/367 tests and shared-package/API/worker builds. Initial sandbox attempt failed only two HTTP tests at `listen EPERM 127.0.0.1` (365 pass); full rerun with local-listener permission passed all367 plus builds, without test changes. This is not native compilation, actual PostgreSQL execution, real Mapbox/Auth/SMS or cloud acceptance.

Documentation/task/link/JS syntax validation is recorded in [baseline report](design/abasong-independent-v1/v12.1-experience/account-baseline-checks.json). Its current scope is source audit and preparation; historical browser reports remain25 delivery+132 existing synthetic checks, not rerun or relabelled as native. No database migrations, cloud resources, qualifications or real user data changed. Human observations remain0/7,38 core+10 circle+7 account rows not_run. No iPhone action needed for this audit.

## Next execution

1. **R4-01**: same-source distance/basis/location snapshot contract, preserving existing200m/verified geometry behavior. Then R4-02 shared card frame and compact apartment content, R4-03 direct contribution form, R4-04 collaboration carousel/filter/camera, R4-05 fresh iOS/Android functional and visual exit.
2. R4-06–10: versioned two-scene/pickup/quantity/date contracts and incremental migration, services/application semantics, native form/preview/details/navigation, availability interaction and dual-native exit.
3. R4-11–13: protect imports/correction/application/messages and close core differences with exact evidence, then B5 profile/My→own team→circle text/replies→private images→invitation.

`development_ready=true` means only controlled **R4-1 implementation can start**; business implementation has not started in this batch. `b5_ready=false`, `release_ready=false`. D14 is umbrella, D22 overlaps D05/D06, D23 overlaps D01; no duplicate counts. D19 cancelled, D24 apartment list P1.7-person usability can run alongside independent local tasks; real-account/KMS/push/independent bundle/physical and field evidence remain B6, not waived or claimed complete. Follow existing issue mapping; do not bulk merge open PRs or close tasks from this audit alone.
