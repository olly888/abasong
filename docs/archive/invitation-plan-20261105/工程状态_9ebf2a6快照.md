# Abasong development status

Updated2026-11-05 (America/Los_Angeles). [Product baseline](产品基线.md), [docs index](docs/README.md), [master plan1.27](docs/Abasong_V12.1_项目开发与验收总计划.md), and [machine gate](docs/product/V3.2_开发基准状态.json) are current. Prior complete status is preserved in [99a76da snapshot](docs/archive/my-simple-20261105/工程状态_99a76da快照.md).

## Current delivery — simplified My and code sharing prototype

Owner approved removing first-release saved contacts, simplifying manual contribution, metric distance/city layout and terminology; then placed the availability switch immediately below personal identity and above the primary share button. Branch `codex/v32-simplify-my-and-sharing` from `99a76da` / PR84. [Target rules](docs/product/Abasong_V3.2_我的与团队资料补充.md), [prototype](design/abasong-independent-v1/v12.1-experience/index.html?v=r3-simple&task=me) and [new checks](design/abasong-independent-v1/v12.1-experience/simplification-checks.json) are reviewable. Actual App remains V3.1; apps/packages/API/OpenAPI/generator/database/cloud/IAM/env/grants/dependencies and old v12.1-import unchanged.

- My: identity → compact availability switch → blue share-code CTA → apartments/posts/applications in one group → own team when applicable → bottom settings. Unified account and voluntary contact sharing remain. No fees, subscriptions or team members.
- Switch: configure/save before enabling; cancel/error stays off; future/expired explicit; closing failure retains old state and can retry, without deleting applications/messages. A current availability window is not online status or automatic dispatch.
- Saved-contact list/notes/actions cancelled; old route returns My, old save handlers do nothing. U08 retired,38 active target pages/354 required states; D19 marked cancelled, not queued B5 workload. Actual historical DB/contract not deleted. Existing first-contact messages/voluntary phone exchange and blocking/recovery remain; empty block list hidden in settings, nonempty under privacy group.
- Global manual entry and apartment-card addition use canonical B02: blank typed suggestions vs explicit prefilled target, same code/door/source fields, no full apartment directory or duplicate screenshot CTA. Changing address clears source confirmation, retains input; unmatched addresses can be verified on the same page, no invented nearby coordinates. Fixed blur rebuilding the candidate before its click arrived.
- Driver UI uses 门禁码/配送需求/找活/找人. City plus approximate m uses existing auxiliary row; no visible boundary/straight-line jargon, same internal basis/sorting; coarse/stale guarded. Normal contribution remains direct after confirmation, but terminology is not an authorization or legal guarantee. The synthetic text reminder still recognizes old/new code wording; it is not a production safety system.

## Executed validation and limits

12/12 [simplification checks](design/abasong-independent-v1/v12.1-experience/simplification-checks.json) plus20/20 [retained account checks](design/abasong-independent-v1/v12.1-experience/account-checks.json) PASS; the4 cancelled contact-list checks are historical, not counted. Regressions34 [map/warehouse](design/abasong-independent-v1/v12.1-experience/browser-checks.json),10 [core](design/abasong-independent-v1/v12.1-experience/core-checks.json),19 [circle](design/abasong-independent-v1/v12.1-experience/circle-checks.json),17 [images](design/abasong-independent-v1/v12.1-experience/circle-images-checks.json) PASS:112 synthetic browser checks,0 script errors/external requests, TEST values only. Screenshots: [My](design/abasong-independent-v1/v12.1-experience/evidence/simple-my.png), [apartment](design/abasong-independent-v1/v12.1-experience/evidence/simple-apartment.png), [address selection](design/abasong-independent-v1/v12.1-experience/evidence/simple-address-candidates.png).

Local baseline command: `python3 design/abasong-independent-v1/v12.1-experience/account-baseline-checks.py`; [actual report](design/abasong-independent-v1/v12.1-experience/account-baseline-checks.json). It checks scope/references,38-page catalog/354-state CSV/spec,13 JS syntax files via Node24, cancelled D19/retired U08, and unchanged38+10+7 human rows. Exact prior state preserved. `git diff --cached --check` and redacted staged gitleaks scan PASS (no leaks found); stacked PRs do not imply main-target remote CI success.

These are browser fixtures, not actual Mapbox/OCR/Auth/SMS/HTTP/PG, iOS/Android, system keyboard/back,200% text or screen-reader acceptance. Human observation remains0/7; all38+10+7 rows not_run, T12 no longer asks for saved contacts/notes. No real contact/message/clipboard/user files or cloud resource changes; no new iPhone test needed now.

## Next and history

Prototype experience feedback/R3 observation → R4 core card/region/date/pickup/contribution regressions → B5 own profile/team/circle actual services/native, with D19 removed → B6 real accounts/KMS/push/independent package/physical/field. development_ready/b5_ready remainfalse; no new participant counts or permission requests.

[Before simplification](docs/archive/my-simple-20261105/README.md), [before My prototype](docs/archive/my-account-20261105/README.md) and linked historical deliveries retain original evidence; their old contact-list or state counts do not override current scope.
