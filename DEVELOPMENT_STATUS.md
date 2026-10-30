# Abasong development status

Updated: 2026-10-29 (America/Los_Angeles). Branch: `codex/d0-engineering`.

## Current stage: D0 engineering bootstrap

Core engineering implementation and checks are complete. Android native compilation and real Mapbox loading remain pending external setup. iOS Debug/Release native builds and Release cold-launch page rendering passed; this is a D0 shell, not full business/device acceptance.

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

- Mapbox public token: user said not ready and requested other validation first. No token requested again or secret token added. Real map/foreground location/address matching remain unverified.
- Android: no usable JDK/SDK found in standard setup. Native compilation and device validation pending; no licenses accepted automatically.
- iOS: full navigation interactions, real iPhone validation and actual map behavior still belong to D1/device acceptance.
- Supabase/Auth, KMS/AWS, SMS, signing/store accounts and real data are not provisioned. No cloud DDL, real SMS, paid account creation or production deployment performed.

## Continue from here

Read [D0 verification record](docs/technical/D0_工程验证记录.md), [dependency-lock.md](dependency-lock.md) and [README.md](README.md). Complete the explicit native/provider gates without repeating product approval. D1 is the apartment lookup/contribution/feedback loop: Auth/object permissions, authorized apartment data, encryption, feedback/order rules and native UI integration. Synthetic data must remain test-only and cannot replace actual provider/device acceptance.

Migration0001 has now been applied locally; subsequent schema changes should use new migrations. Database service-role access does not implement end-user authorization. Worker currently probes connectivity only and must not acknowledge real events before handlers exist.
