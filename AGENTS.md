# Abasong engineering instructions

## Product baseline
- Read `产品基线.md`, `DEVELOPMENT_STATUS.md`, and `docs/README.md` before changes.
- Priority: latest human instruction, V12.1 supplement/page specification, approved V3 prototype, V12 PRD. V9 and old task imports are historical.
- Only temporary delivery support and flexible collaboration. One client; 首页/司机圈/我的. No long-term recruitment, payment/settlement, automatic dispatch, carrier scanning or POD.
- P0 apartment contribution includes user-selected single/multiple screenshots: read `docs/product/Abasong_V12.1_截图批量贡献需求补充.md`. OCR candidates require confirmation; new B04/B05/B06 and import contracts are pending, not covered by the old prototype acceptance.
- Prototype reference: `design/abasong-independent-v1/v12.1/`. Never treat synthetic browser data or client-side permissions as a production service/security implementation.

## Repository and commands
- `apps/mobile`: Expo development build + React Native/Mapbox. Expo Go is not a native Mapbox test.
- `apps/api`: NestJS API; `apps/worker`: background process; `packages/contracts`: generated OpenAPI types; `packages/ui`: shared V3 tokens.
- Use Node 24 LTS and pnpm 10.32.1 through `./scripts/dev`. Do not change the user's global runtime or maintain competing lockfiles.
- `./scripts/dev check` runs lint, workspace type checks, tests and builds. `./scripts/dev db:verify` applies/validates migrations only on the isolated D0 database.
- Generate contracts with `./scripts/dev contracts:generate`; change the OpenAPI source/generator together, not only generated output.
- Document actual executed checks and limitations. Do not label prebuild, mock UI or static SQL parsing as native compilation/database execution.

## Data and access
- Never print or commit credentials, OTPs, access codes, message bodies, precise driver GPS or connection strings. Use ignored local env files and environment-specific secrets.
- Business data flows through authenticated API/object authorization. Database RLS service-role policies alone are not per-user authorization.
- No cloud migrations or production changes without explicit project/environment authorization. D0 database scripts must reject non-local/non-D0 targets.
- Keep public request-share DTOs independent from full business requests. Do not expose access records, private meeting points or user contact details.

## Working habits
- Preserve existing changes and historical documents. No destructive cleanup, database resets or global permission changes to fix routine failures.
- If parallel work is explicitly authorized, use separate branches/worktrees with clear ownership rather than concurrent edits on main. Do not spawn agents merely because tools exist.
- Keep task state in `DEVELOPMENT_STATUS.md`; record dependency decisions in `dependency-lock.md`. Update handoff state before context becomes insufficient; use client compaction when available.
- User preferences take priority over skill defaults. Do not inject additional skill routing, telemetry, plugins or approval requirements.
- The user revoked mandatory gstack usage on 2026-10-29 and explicitly reaffirmed this on 2026-10-30, including /browse. Choose built-in tools, direct engineering work or relevant skills as needed; no gstack dependency is required. Prefer first-party documentation for technical claims.
- Routine authorized implementation/test/fix work proceeds autonomously. Ask only for missing external state or consequential authorization; do not accept legal agreements on the user's behalf.
