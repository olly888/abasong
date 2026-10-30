# Abasong development status

Updated: 2026-10-30 (America/Los_Angeles). Branch: `codex/d1-apartment`.

## Current stage: D0 complete; D1 apartment loop started

D0 engineering checks are complete. Android ARM64 Debug compilation/install/start passed. iOS Release rebuild/install/start with Mapbox passed. Actual Los Angeles basemaps rendered on both simulators; Android map panning passed. This is a D0 shell, not full business/device acceptance.

Approved inputs: V12.1 requirement supplement/page specification, V3 tokens and user-reviewed interactive prototype. Business scope remains temporary delivery support only, one client with three tabs and private settlement.

## Implemented and verified

- Monorepo mobile/API/worker/contracts/UI packages, exact direct dependency versions, Node24 wrapper, pnpm and native iOS locks.
- API liveness/readiness, independent worker database probe and graceful shutdown. Account bootstrap/current-user API is now implemented; no apartment CRUD or event consumption yet.
- Isolated local PostgreSQL/PostGIS migration: 45 tables, forced RLS, non-owner login, sensitive separation, append-only history permissions, constraints, spatial query and rollback verification passed.
- Lint, workspace/script type checks, one database-target protection unit test and builds passed.
- Real service smoke passed: healthy200, unknown business route404, DB outage503 without sensitive details, restricted worker connection.
- iOS/Android JavaScript bundles and native prebuild succeeded. iOS Debug/Release native compilation succeeded with Mapbox SDK; Release installed and cold-launched with actual home and three-tab rendering verified on the active display.
- CI definition, root README, project instructions, generated contracts/tokens and evidence report are present. Remote CI has not run; no remote repository configured/pushed.

## External dependencies / remaining gates

- Mapbox: user supplied a public token; stored in ignored apps/mobile/.env.local with mode600. Official style access verification passed without echoing token. Native map rendering passed on both simulators; foreground location/address matching remain D1 work.
- Android: user personally read/accepted the SDK terms and authorized installation on 2026-10-29. OpenJDK17, SDK37.0, Build Tools37, NDK27.1, CMake3.22.1 and a dedicated ARM64 emulator are installed. Gradle9.4.1 runs; native build/install/start and basemap rendering passed via scripts/android. Physical-device validation remains later.
- iOS: full navigation interactions, real iPhone validation and actual map behavior still belong to D1/device acceptance.
- Supabase/Auth active development project is AbasongDevWest (us-west-1, North California; switched 2026-10-30); public client and issuer settings configured locally. Phone provider enabled with Twilio Verify on 2026-10-30 after explicit user authorization; iOS real SMS/session acceptance subsequently passed. KMS/AWS, store signing accounts and apartment business services are not provisioned. No cloud DDL, paid account upgrade or production deployment performed.

## Continue from here

Read [D0 verification record](docs/technical/D0_工程验证记录.md), [dependency-lock.md](dependency-lock.md) and [README.md](README.md). Complete the explicit native/provider gates without repeating product approval. D1 is the apartment lookup/contribution/feedback loop: Auth/object permissions, authorized apartment data, encryption, feedback/order rules and native UI integration. Synthetic data must remain test-only and cannot replace actual provider/device acceptance.

Migration0001 has now been applied locally; subsequent schema changes should use new migrations. Database service-role access does not implement end-user authorization. Worker currently probes connectivity only and must not acknowledge real events before handlers exist.

Latest tool preference: mandatory gstack use revoked by the user. Native tools/direct implementation or suitable skills may be chosen as needed. See [D0补齐说明](docs/technical/D0_Android与Mapbox补齐说明.md).

## D1 first implementation batch

Internal metadata-only access-ranking SQL implemented. Sixteen real PostgreSQL scenarios passed under the API role, with all synthetic fixtures rolled back. Explicit feedback interval required; no production window invented. CI includes the verifier. No secret lookup/HTTP endpoint has been exposed; Auth/object/schedule permissions, encryption, contribution/feedback transactions, native card integration and device validation remain. See [D1 record](docs/technical/D1_公寓闭环开发记录.md).

## Live preview

Native shared Metro configured at localhost8081; iPhone18Pro/iOS27.0 and Android17/API37 both confirmed as connected React Native debugger targets. iOS uses Device Hub with Debug build; Android uses a project emulator with scrcpy5.0.1 live display due to Qt window rendering errors. Repeatable scripts and [usage guide](docs/technical/原生实时预览使用说明.md) added. Browser preview is optional, shares the screens/navigation, and isolates Web map rendering in packages/web-map with a genuine Static Images fallback when WebGL is unavailable; it is not a substitute for native/device validation.

## D1 identity/account batch

POST /v1/me/bootstrap and GET /v1/me implemented with strict JWT/JWKS validation, current account/capability checks, private DTOs, request IDs, idempotent transactions and no-store errors. Fifty-four real HTTP scenarios passed using ephemeral signing keys and an isolated disposable local DB. Existing smoke and 16 ranking tests passed. User Supabase project metadata/JWKS/public settings inspected read-only: healthy, us-east-1, ES256; phone login disabled. Public client settings saved locally; no cloud schema/auth mutation, real users or SMS. Initial real mobile/Supabase login was unverified at that batch; subsequent iOS acceptance is recorded below. See [identity verification record](docs/technical/D1_身份与账号接口验证.md).

## D1 native login batch

Phone/OTP/display-name routes and real account states implemented outside three-tab navigation. Native sessions use SecureStore with no plaintext fallback; browser sessions use memory only. Account requests are identity-bound, bounded and refresh once; logout clears personal state and blocks refresh-event races. Complete workspace checks (3 unit tests) and 54 HTTP auth scenarios passed again. Both native Debug builds/install passed; iOS unsigned build exposed a Keychain entitlement issue, resolved by rebuilding/installing with standard simulator local signing; cold launch no longer reports storage read errors. Real session persistence remains unverified. After user unlock on 2026-10-30, native guest/login navigation, empty input state, region selection, invalid-number feedback and page return passed on both simulators. Android mirror required keyboard focus for reliable submit/back; full touch and screen-reader acceptance remain unverified. SMS provider remains disabled; actual OTP/session persistence and full D1 are unverified. See [native login record](docs/technical/D1_原生登录接入记录.md). Metro8081 and API3001 are running locally for preview.

## Latest UI verification

2026-10-30: iPhone18Pro/iOS27.0 and Android17/API37 phone-entry checks completed after unlock. Invalid numbers only; no SMS, cloud auth changes or test bypass. This turn changes validation documentation only; prior full checks remain applicable. Next D1 work remains authorized apartment lookup/contribution/feedback and object permissions; real SMS/session acceptance still needs provider setup.

## Tool preference reaffirmed

2026-10-30: User explicitly cancelled mandatory gstack /browse. Choose native tools, direct model work or relevant skills according to the task. No mandatory gstack routing.

## West development project switch

2026-10-30: User-created AbasongDevWest verified ACTIVE_HEALTHY in us-west-1 (North California), not the previously suggested Oregon. Switched ignored client URL/publishable key and API issuer/audience/ES256 configuration; preserved Mapbox and all local DB settings. JWKS and public Auth settings returned successfully; Phone disabled, email enabled. Old us-east-1 project preserved, no cloud DDL/data migration/Auth setting change/SMS. Deployment plan updated to colocate future API/worker/KMS in us-west-1; no AWS resources created. Local API and Metro restarted with new env. User has no SMS provider yet and requested signup guidance.

## Twilio signup reported complete

2026-10-30: User reports Twilio signup completed. No credentials obtained, Verify Service/account restrictions unverified, Phone provider not yet confirmed enabled. Next: user enters Twilio Verify credentials directly into AbasongDevWest provider form, then read-only configuration check and explicitly authorized real-phone acceptance.

## Phone provider enabled

2026-10-30: User explicitly authorized copying the existing Twilio Auth Token directly to AbasongDevWest and saving/enabling Phone, with no upgrade, phone-number purchase or SMS. Completed via the user’s logged-in Chrome session because plugin search found no Twilio plugin and current Supabase connector has no Auth-provider configuration action. Used the existing trial Verify Service shown in Try out Verify; self-created services are upgrade-gated. Supabase UI now shows Phone ENABLED; public /auth/v1/settings independently reports phone=true, email=true, anonymous=false. Phone confirmation stayed enabled; other providers/signup policies unchanged. Token transferred only through clipboard to the masked provider field, never revealed/read into model output or saved locally; clipboard then replaced with the non-sensitive page URL. No SMS, real user creation, paid upgrade, number purchase or cloud DDL. Provider save does not validate real delivery or Verify API compatibility; receiving/confirming OTP, native session restore and logout remain pending.

## iOS real Auth/session acceptance

2026-10-30: User reported actual SMS receipt/OTP login success. Observed authenticated profile from protected local API on iPhone18Pro/iOS27.0; account remained pending eligibility rather than auto-granted access. Force-terminated and cold-started app: real account restored without another OTP. Tested local logout, then force-terminated/cold-started again: guest state remained and old profile did not return. No OTP/phone/token read, logged or extracted; no additional SMS or cloud schema changes. Account not deleted; simulator deliberately left signed out after acceptance. Android real SMS/session, physical devices, expiry refresh, multi-account and network-failure acceptance remain pending. Next D1: authorized apartment lookup, encrypted contribution/feedback and native card integration.

## P0 screenshot contribution scope extension

2026-10-30: User explicitly prioritizes single/multiple carrier-app screenshots to populate apartment codes without repeated manual entry. Updated PRD/supplement, V3 component guidance, page generator and generated Markdown/JSON/CSV, prototype plan and T25–T31 implementation tasks. Catalogue now39 nodes/237 state variants; new B04/B05/B06 remain unbuilt, old approved36-node prototype untouched. Screenshot is P0; text/table import P1. OCR candidates require batch confirmation, uncertain items do not block other submissions; no invented useful votes or refreshed original contribution time. Import batches introduce finite server-encrypted drafts, while manual cleartext remains memory-only. New API/DB/worker designs pending; no OpenAPI or applied SQL altered, no external OCR configured or real images uploaded. Next: new interaction flow and authorized/synthetic samples, T27 contract and incremental data design before implementation.

Screenshot documentation checks: generator reproducibility, Python syntax, unique39-node/237-state catalogue, valid action targets and existing operation references, pending API markers, CSV alignment and local Markdown links passed. Full SQL/OpenAPI validator not rerun (pglast missing); no SQL/OpenAPI source changed. Prototype, OCR and native behavior not tested in this documentation-only change.

## Screenshot contribution interaction prototype

2026-10-30: Built independent `design/abasong-independent-v1/v12.1-import/`, preserving the approved original directory. Added B04/B05/B06 and U01/U06/H01/B02 entries; six synthetic image fixtures map to seven predefined candidates. Browser checks covered multi-select, batch source confirmation, symbol/address correction, apartment proposal pending review, duplicate preservation of original time, partial submit/retry, processing leave/resume, OCR-failure/retry, preview and cancel. Fixed mobile footer clipping and async completion closing the cancel dialog. 375/390/430×844 layouts had no horizontal overflow and visible footer; observed console error list empty. No real OCR/upload/native photo picker, server-encrypted draft, API/OpenAPI or database implementation changed. Text/table P1 remain outside active App menus. Catalogue now marks new prototype as awaiting user review; full237-state/device acceptance not claimed. See extension README/acceptance record.

## Personal apartment library scope and prototype

2026-10-30: Unified U01 entry as 我的公寓; U06 saved/shared tabs and U09 personal detail added to the isolated extension. Private edits, favorites/regions, unknown-address private saving, explicit sharing, correction history and synthetic effect summaries are interactive. Screenshot confirmation defaults to private save with explicit optional sharing. Browser synthetic checks covered private/shared separation, correction history, private import, region filtering and unknown-address saving. Catalogue now40 nodes/251 states; original approved prototype preserved. No real persistence/OCR/analytics/native/API/DB feature added. T32–T35 and implementation design document added; next is T27 source contract/generated types, then incremental local migration and authenticated isolation tests. No cloud changes.

Personal-library checks: JS syntax, page-generator reproducibility, 40-node/251-state target/operation consistency, CSV count, local links and git whitespace passed. U06 at375/390/430×844 had no horizontal overflow, visible52px footer buttons; console errors empty. Extension manual duplicate contribution no longer sets a useful vote. Full SQL/OpenAPI validator not rerun (pglast unavailable); no SQL/OpenAPI changed. No native/business-backend acceptance implied.

资格场景检查：通过首页真实导航进入我的公寓，无共享资格时本人私存可见、共享正文隐藏。页面目录检查器会恢复演示资格，因此未用检查器结果代替该权限场景检查；这仍只是UI演示，不是服务端授权测试。
