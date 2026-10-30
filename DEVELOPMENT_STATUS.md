# Abasong development status

Updated: 2026-10-29 (America/Los_Angeles). Branch: `codex/d0-engineering`.

## Current stage: D0 complete; D1 apartment loop next

D0 engineering checks are complete. Android ARM64 Debug compilation/install/start passed. iOS Release rebuild/install/start with Mapbox passed. Actual Los Angeles basemaps rendered on both simulators; Android map panning passed. This is a D0 shell, not full business/device acceptance.

Approved inputs: V12.1 requirement supplement/page specification, V3 tokens and user-reviewed interactive prototype. Business scope remains temporary delivery support only, one client with three tabs and private settlement.

## Implemented and verified

- Monorepo mobile/API/worker/contracts/UI packages, exact direct dependency versions, Node24 wrapper, pnpm and native iOS locks.
- API liveness/readiness, independent worker database probe and graceful shutdown. No business CRUD or event consumption yet.
- Isolated local PostgreSQL/PostGIS migration: 45 tables, forced RLS, non-owner login, sensitive separation, append-only history permissions, constraints, spatial query and rollback verification passed.
- Lint, workspace/script type checks, one database-target protection unit test and builds passed.
- Real service smoke passed: healthy200, unknown business route404, DB outage503 without sensitive details, restricted worker connection.
- iOS/Android JavaScript bundles and native prebuild succeeded. iOS Debug/Release native compilation succeeded with Mapbox SDK; Release installed and cold-launched with actual home and three-tab rendering verified on the active display.
- CI definition, root README, project instructions, generated contracts/tokens and evidence report are present. Remote CI has not run; no remote repository configured/pushed.

## External dependencies / remaining gates

- Mapbox: user supplied a public token; stored in ignored apps/mobile/.env.local with mode600. Official style access verification passed without echoing token. Native map rendering passed on both simulators; foreground location/address matching remain D1 work.
- Android: user personally read/accepted the SDK terms and authorized installation on 2026-10-29. OpenJDK17, SDK37.0, Build Tools37, NDK27.1, CMake3.22.1 and a dedicated ARM64 emulator are installed. Gradle9.4.1 runs; native build/install/start and basemap rendering passed via scripts/android. Physical-device validation remains later.
- iOS: full navigation interactions, real iPhone validation and actual map behavior still belong to D1/device acceptance.
- Supabase/Auth, KMS/AWS, SMS, signing/store accounts and real data are not provisioned. No cloud DDL, real SMS, paid account creation or production deployment performed.

## Continue from here

Read [D0 verification record](docs/technical/D0_工程验证记录.md), [dependency-lock.md](dependency-lock.md) and [README.md](README.md). Complete the explicit native/provider gates without repeating product approval. D1 is the apartment lookup/contribution/feedback loop: Auth/object permissions, authorized apartment data, encryption, feedback/order rules and native UI integration. Synthetic data must remain test-only and cannot replace actual provider/device acceptance.

Migration0001 has now been applied locally; subsequent schema changes should use new migrations. Database service-role access does not implement end-user authorization. Worker currently probes connectivity only and must not acknowledge real events before handlers exist.

Latest tool preference: mandatory gstack use revoked by the user. Native tools/direct implementation or suitable skills may be chosen as needed. See [D0补齐说明](docs/technical/D0_Android与Mapbox补齐说明.md).
