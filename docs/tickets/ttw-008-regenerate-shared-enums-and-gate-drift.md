# TTW-008 — Regenerate the shared enums and fail CI when they drift

**Epic:** 0 — Trustworthy delivery system\
**Status:** Complete\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

`packages/types/src/enums.generated.ts` is generated from `apps/api/prisma/schema.prisma` by `pnpm --filter @tamiym/types generate:enums` (`packages/types/scripts/generate-enums.ts`). On `main` (`1f7c852`), running the generator — or `pnpm build`, whose `prebuild` in `packages/types/package.json:10` runs it — rewrites the file with **+52 lines**: seven schema enums are missing from the committed file.

- TTW-043: `NotificationCategory`, `NotificationPreferenceChannel`, `NotificationSuppressionReason`, `NotificationConsentSource`, `NotificationAttemptOutcome`, `DeadLetterAckStatus`.
- `PayoutProfileStatus` (payout profile verification).

The diff only adds enums; no existing enum or value changes.

Why it was not caught: CI has no enum drift gate. `pnpm openapi:check` (`scripts/quality/check-openapi-drift.mjs`) only compares `docs/openapi/openapi.json` and `packages/types/src/openapi.generated.ts`. The CI `Production Build` job runs `pnpm build`, which silently regenerates the file in the runner and never compares it with the committed copy. Locally, the drift showed up as an unrelated dirty file after builds and was restored by hand in TTW-037 and TTW-007.

## Proposal

1. Regenerate the file with the generator (never by hand).
2. Add a drift gate on the same pattern as `openapi:check`: the generator gains optional `--schema` / `--output` flags (defaults unchanged), and `scripts/quality/check-enums-drift.mjs` generates into a temp directory and fails when the committed file differs. `pnpm enums:check` runs it; `pnpm enums:check:test` runs its unit tests. CI runs both in the existing `OpenAPI Contracts` job (shared contracts, no new required check to configure).

Rejected: `git diff --exit-code` after `pnpm build` in CI — slower, and it would only check the files the build happens to touch.

## Invariants

- The committed shared enums equal the generator's output for the committed Prisma schema.
- The generator's default behaviour (read the API schema, write `src/enums.generated.ts`) is unchanged.

## Implementation plan

1. Regenerate `packages/types/src/enums.generated.ts`.
2. Write `scripts/quality/__tests__/check-enums-drift.test.mjs` first (fails: module missing), then add the generator flags and the check script.
3. Wire `enums:check` / `enums:check:test` into `package.json`, the CI `OpenAPI Contracts` job and the docs (`docs/README.md`, `docs/11-development-setup.md`).
4. Run typecheck, lint and the new tests; prove the gate catches the old `main` file.

## Test and observability plan

- Unit/component: `check-enums-drift.test.mjs` (`node:test`, runs the real generator): repository files pass; a committed file missing an enum is reported; a schema enum added after generation is reported.
- Integration/e2e: not applicable (types only; no runtime behaviour change).
- Failure, retry, and concurrency: not applicable.
- Logs, metrics, traces, and alerts: none.

## References

- `packages/types/scripts/generate-enums.ts` — generator.
- `packages/types/package.json:10` — `prebuild` regenerates on every build.
- `scripts/quality/check-openapi-drift.mjs` — existing drift gate this one mirrors.
- `.github/workflows/ci.yml` — `OpenAPI Contracts` job.
- `docs/tickets/ttw-037-prevent-duplicate-standard-checkout-orders.md:275`, `:343` — drift observed and restored.

## Acceptance criteria

- [x] `packages/types/src/enums.generated.ts` equals the generator's output (`pnpm enums:check` passes).
- [x] The gate fails on the file committed on `main` before this ticket (see evidence).
- [x] `pnpm typecheck` and `pnpm lint` pass, including the frontends that use `@tamiym/types`.
- [x] CI `OpenAPI Contracts` job green on GitHub with the new step.

## Out of scope

- Adopting the new enums in the frontends.
- Schema vs migrations drift → TTW-005.

## Design review

Not required (low risk).

## Implementation reviews

- 2026-11-03, `/code-review low` on the full diff (generator flags, check script, `package.json`, CI step): **no findings**.

## Verification evidence

### Local, 2026-11-03 (Node 24.22.1)

- Regeneration: `pnpm --filter @tamiym/types generate:enums` → "Found 61 enums"; `git diff --stat` → `packages/types/src/enums.generated.ts | 52 +++` (additions only, seven enums listed above).
- Red: `node --test scripts/quality/__tests__/check-enums-drift.test.mjs` before the script existed → fail (module not found).
- Green: same command → **3/3 passed** (`checkEnumsDrift passes on the committed repository files`, `… reports a committed file missing a schema enum`, `… reports a schema enum added after generation`).
- Gate against the old file: `checkEnumsDrift({ committedPath: <git show HEAD:packages/types/src/enums.generated.ts> })` → `true` (drift detected).
- `pnpm typecheck` → 6/6 tasks successful (api, web, app, admin, types, ui); `pnpm lint` → 6/6 successful (14 pre-existing warnings in `api`, 0 errors); `pnpm enums:check` → "Shared enum drift check passed."; `pnpm enums:check:test` → 3/3; `pnpm docs:validate` passed, `pnpm docs:validate:test` 11/11; `pnpm workflows:validate` passed; Prettier check clean on every changed file.
- Not run: `pnpm build`, unit/e2e suites (no runtime code changed), GitHub CI.

## Completion summary

File regenerated by the generator (+7 enums, additions only). New gate `pnpm enums:check` runs in the CI `OpenAPI Contracts` job. Committed as `88ebf08`, merged to `main` (`6323a28`). CI run [41931373328](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/41931373328) on `main` `541bad4` is green on all 18 jobs, including `OpenAPI Contracts` with the new step. Nothing left in scope.
