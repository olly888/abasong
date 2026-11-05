# Abasong development status

Updated 2026-11-05 (America/Los_Angeles). [Product baseline](产品基线.md), [docs index](docs/README.md), [master plan 1.28](docs/Abasong_V12.1_项目开发与验收总计划.md) and [machine gate](docs/product/V3.2_开发基准状态.json) are current. The complete previous delivery and its test report are preserved in the [9ebf2a6 archive](docs/archive/invitation-plan-20261105/README.md).

## Current delivery — invite-driver feature proposal

User requested an “邀请司机” menu to help drivers recommend Abasong through its actual value. Branch `codex/v32-driver-invitation-plan` from `9ebf2a6` / PR85. [Functional proposal](docs/product/Abasong_V3.2_邀请司机功能方案.md) defines entry, copy, sharing, receiving, technical boundaries and acceptance. **This batch changes documentation and baseline validation only. Prototype UI, actual App/API/OpenAPI/generator/database/cloud/IAM/env/grants/dependencies and distribution are unchanged. No invitations sent.**

- Proposed My entry: identity → compact availability switch → blue share-code CTA → grouped apartments/posts/applications → secondary invite-drivers/conditional own-team group → settings. Existing My remains unchanged until the invitation prototype is made.
- Proposed U15: value headline, generic QR invitation image, primary system share, secondary save-image/copy-text-and-link. Headline: “到了公寓进不去？先看看同行共享的门禁码。” Describe only capabilities available in the distributed version; honest community-coverage note.
- Proposed X02: public value introduction before login, then real available platform distribution/open-app entry. First-party HTTPS `/invite` is only a proposed path, not a deployed address. No fake store/TestFlight/Metro link or new waitlist collection.
- Generic link/QR is sufficient for the first version. No personal invite code, reward, ranking, invitation list, contact import, automated messaging, team membership or viewing qualification. Never attach gate codes, user/contact data, precise location or business-share tokens.
- Share callbacks do not prove delivery/registration; cancellation is not invitation success. Installed-app link association and cross-install attribution are separate; first version does not require personal attribution. No new SDK or infrastructure was added.
- Trace: G21/D21, UP18/UX16, C146–155. U15/X02 are reserved in planned_extensions, excluded from the active 38-page/354-state catalog. AC-I01–14 are planned, not executed. Current scope/gates keep R4 core value priorities before B5 growth work.

## Validation and evidence limits

Run `python3 design/abasong-independent-v1/v12.1-experience/account-baseline-checks.py`; the [actual baseline report](design/abasong-independent-v1/v12.1-experience/account-baseline-checks.json) records documentation references, scope, trace consistency, reserved IDs, the unchanged page/spec/state matrix, 13 existing JS syntax checks and preservation of the prior complete status. 483 assertions and 302 local references passed; the 13 existing JS files passed syntax checks. Staged diff and redacted gitleaks checks passed with no leaks found. These checks do not implement or validate invitation UX.

The existing [r3-simple prototype](design/abasong-independent-v1/v12.1-experience/index.html?v=r3-simple&task=me) remains the latest interactive UI. Its prior 112 synthetic browser results are preserved, not rerun or credited to invitations: 34 map/warehouse + 10 core + 19 circle + 17 circle-images + 20 account + 12 simplification. Actual App remains V3.1; no new native, HTTP/PG, Mapbox, OCR, SMS, system share/photo permission, deep-link or physical-device acceptance was performed in this documentation batch.

Human observations remain 0/7, with 38 core + 10 circle + 7 account rows not_run. development_ready/b5_ready remain false; this proposal does not create a new core R4 human-test gate. No iPhone action is needed for this batch. Prior stacked PR evidence does not imply CI for the latest commit.

## Next delivery and retained rules

Make U01/U15/X02 invitation prototype with TEST-only links/QR and cancellation/failure/unavailable-distribution states → user experience confirmation → integrate D21 into B5 after core R4 exits → B6 real distribution/link association and physical-device validation. No public sharing until the receiving page and usable distribution are ready.

The [current My rules](docs/product/Abasong_V3.2_我的与团队资料补充.md) remain: one account, voluntary contact sharing, no fees or team-member management, U08 retired/D19 cancelled, existing conversations and blocking/recovery retained. Canonical B02 manual contribution, concise nearby apartment cards and city/m auxiliary line are unchanged. [Prior status](docs/archive/invitation-plan-20261105/工程状态_9ebf2a6快照.md) preserves the complete implementation and evidence history.
