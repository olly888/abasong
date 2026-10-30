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
- Supabase/Auth active development project is AbasongDevWest (us-west-1, North California; switched 2026-10-30); public client and issuer settings configured locally. Phone provider enabled with Twilio Verify on 2026-10-30 after explicit user authorization; real SMS not yet sent. KMS/AWS, SMS provider, store signing accounts and real business data are not provisioned. No cloud DDL, real SMS, paid account creation or production deployment performed.

## Continue from here

Read [D0 verification record](docs/technical/D0_工程验证记录.md), [dependency-lock.md](dependency-lock.md) and [README.md](README.md). Complete the explicit native/provider gates without repeating product approval. D1 is the apartment lookup/contribution/feedback loop: Auth/object permissions, authorized apartment data, encryption, feedback/order rules and native UI integration. Synthetic data must remain test-only and cannot replace actual provider/device acceptance.

Migration0001 has now been applied locally; subsequent schema changes should use new migrations. Database service-role access does not implement end-user authorization. Worker currently probes connectivity only and must not acknowledge real events before handlers exist.

Latest tool preference: mandatory gstack use revoked by the user. Native tools/direct implementation or suitable skills may be chosen as needed. See [D0补齐说明](docs/technical/D0_Android与Mapbox补齐说明.md).

## D1 first implementation batch

Internal metadata-only access-ranking SQL implemented. Sixteen real PostgreSQL scenarios passed under the API role, with all synthetic fixtures rolled back. Explicit feedback interval required; no production window invented. CI includes the verifier. No secret lookup/HTTP endpoint has been exposed; Auth/object/schedule permissions, encryption, contribution/feedback transactions, native card integration and device validation remain. See [D1 record](docs/technical/D1_公寓闭环开发记录.md).

## Live preview

Native shared Metro configured at localhost8081; iPhone18Pro/iOS27.0 and Android17/API37 both confirmed as connected React Native debugger targets. iOS uses Device Hub with Debug build; Android uses a project emulator with scrcpy5.0.1 live display due to Qt window rendering errors. Repeatable scripts and [usage guide](docs/technical/原生实时预览使用说明.md) added. Browser preview is optional, shares the screens/navigation, and isolates Web map rendering in packages/web-map with a genuine Static Images fallback when WebGL is unavailable; it is not a substitute for native/device validation.

## D1 identity/account batch

POST /v1/me/bootstrap and GET /v1/me implemented with strict JWT/JWKS validation, current account/capability checks, private DTOs, request IDs, idempotent transactions and no-store errors. Fifty-four real HTTP scenarios passed using ephemeral signing keys and an isolated disposable local DB. Existing smoke and 16 ranking tests passed. User Supabase project metadata/JWKS/public settings inspected read-only: healthy, us-east-1, ES256; phone login disabled. Public client settings saved locally; no cloud schema/auth mutation, real users or SMS. Real mobile/Supabase login remains unverified. See [identity verification record](docs/technical/D1_身份与账号接口验证.md).

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
