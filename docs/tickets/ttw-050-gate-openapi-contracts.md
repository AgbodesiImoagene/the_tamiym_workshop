# TTW-050 — Gate OpenAPI and client contracts against drift

**Epic:** 5 — Contracts, observability and release proof  
**Status:** In progress (slice 1)  
**Risk:** High  
**Blocked by:** TTW-002, TTW-003  
**Blocks:** TTW-053, TTW-054

## Background

Swagger UI is built dynamically inside the API bootstrap, but the repository has no deterministic OpenAPI JSON artefact, generation command or CI drift check. The shared types package exports Prisma-derived enums and two base interfaces, not request/response contracts generated from the mounted API. Controllers can therefore change routes or DTO shapes while frontend code, documentation and review evidence remain stale. Several controller responses are description-only, which further limits generated-client usefulness.

## Proposal

Extract application and Swagger document construction into importable functions that do not listen on a port. Generate a deterministic OpenAPI 3 document from the real mounted `AppModule`, normalize non-semantic ordering, validate it, and commit it as the API contract. Generate TypeScript operation/schema types from that document into `@tamiym/types`, export them through an explicit generated entry point, and prohibit manual edits. Add a CI command that regenerates both artefacts in a temporary location and fails on any diff, invalid/duplicate operation identifier, undocumented mounted operation, or broken frontend typecheck.

## Invariants

- The contract is generated from the same modules, prefix, validation model and security schemes used by the running API.
- Generation never starts a listener, invokes external providers, requires production secrets or mutates application data.
- Identical source produces byte-identical OpenAPI and TypeScript output.
- Generated files are never edited manually and cannot silently lag controller/DTO behaviour.
- Private implementation details, secrets, cookie values and example credentials never enter the committed specification.
- A breaking contract change is explicit in review and is paired with all affected client changes.

## Implementation plan

1. Inventory every mounted controller method and record gaps in tags, operation IDs, request bodies, responses, pagination and auth/security annotations.
2. Extract reusable Nest application configuration and Swagger document creation from `main.ts`; keep production bootstrap behaviour unchanged and close the generated application cleanly.
3. Establish a stable operation-ID convention based on controller and method identity, reject duplicates, and add missing DTO/response schemas needed by the current frontend operations.
4. Add scripts to generate and validate a normalized `docs/openapi/openapi.json` and `packages/types/src/openapi.generated.ts`; add generated-file headers and exports.
5. Add contract tests for representative public, customer, organiser and admin operations plus cookie/bearer security, validation errors and pagination envelopes.
6. Add a CI drift command that regenerates into an isolated temporary directory, compares both artefacts and prints an actionable semantic summary before failing.
7. Update API/frontend contributor guidance for additive, breaking and deprecation changes, including the required regeneration and review commands.

## Test and observability plan

- Unit/component: Test normalization, operation-ID generation and schema validation; type-test representative success/error operations in `@tamiym/types`.
- Integration/e2e: Generate from the production `AppModule`, assert key routes from all roles, compare mounted-route inventory to the specification, and typecheck all three frontends against generated contracts.
- Failure, retry, and concurrency: Prove a changed DTO, removed route, duplicate operation ID, invalid schema and stale generated client each fail CI; run generation twice to prove determinism and clean shutdown.
- Logs, metrics, traces, and alerts: CI reports added/removed/changed operations without request examples containing secrets; generation failures identify the controller/operation and validation rule.

## References

- `apps/api/src/main.ts:46-85` — Swagger document construction is coupled to runtime bootstrap and only exposed as UI.
- `packages/types/src/index.ts:1-18` — shared package exports generated Prisma enums and base interfaces only.
- `packages/types/src/enums.generated.ts:1-8` — existing generated-file convention.
- `packages/types/scripts/generate-enums.ts` — existing schema-to-types generation precedent.
- `docs/12-testing-strategy.md:42-50` — requires OpenAPI/schema contract validation.
- `.github/workflows/ci.yml` — no OpenAPI generation or drift gate exists.

## Acceptance criteria

- [ ] One documented command generates a valid, deterministic OpenAPI JSON document from the real mounted API without listening or contacting external systems.
- [ ] Every mounted HTTP operation has a unique stable operation ID, documented security and concrete request/success/error schemas where applicable.
- [ ] `@tamiym/types` exports deterministic generated operation/schema types consumed successfully by all affected frontends.
- [ ] CI fails on stale OpenAPI/client output, invalid specification, duplicate/missing operation IDs and mounted-route drift.
- [ ] Representative public, customer, organiser and admin contract tests pass, and generation leaves no open handles.
- [ ] High-risk design, security and independent implementation reviews pass with exact evidence recorded below.

## Out of scope

- Changing business behaviour merely to simplify a schema → owning domain ticket.
- Browser journey coverage → TTW-004 and TTW-053.
- Supporting an additional external API version; this ticket documents and gates the current `/v1` surface.

## Design review

**Reviewer:** implementation agent (slice 1)  
**Date:** 2026-08-22  
**Blast radius:** API bootstrap (`main.ts`), new `apps/api/src/openapi/*` helpers, committed `docs/openapi/openapi.json`, generated `packages/types/src/openapi.generated.ts`, root `openapi:*` scripts, CI `openapi` job. Runtime HTTP behaviour unchanged; production still serves Swagger UI from the same document builder.

**Generator / validator:** `apps/api/scripts/generate-openapi.ts` boots real `AppModule` with `NODE_ENV=test`, `OTEL_SDK_DISABLED=true`, and `apps/api/.env.test` (no production secrets, no listener). Document built via shared `createOpenApiDocument()` + `operationIdFactory` (`ControllerName_methodName`). Normalized with recursive key sort and stable array ordering; Nest bearer/cookie schemes repaired to valid OpenAPI 3 before `@apidevtools/swagger-parser` validation. Types via `openapi-typescript` into `@tamiym/types`.

**Operation IDs:** `buildOperationId(controllerKey, methodKey)` → `AuthController_login`; duplicates fail generation via `assertUniqueOperationIds`.

**Normalization:** `repairSecuritySchemes` + recursive JSON key sort; `tags`/`required`/`enum` arrays sorted lexicographically; trailing newline on artefact.

**Application lifecycle:** `createApiApplication()` → `init()` → generate → `validateOpenApiDocument()` → write → `app.close()`; no external provider calls required for generation.

**Security / privacy:** Generation uses test env placeholders only; committed spec contains no secrets. Cookie scheme exported as `apiKey`/`cookie` for valid clients.

**Slice 1 progress:** foundational pipeline, drift gate, representative contract tests, CI job — complete. Route/schema annotation inventory, frontend consumption, and mounted-route inventory gate deferred to slice 2+.

**Verdict:** APPROVED for slice 1 implementation (foundational pipeline only).

## Implementation reviews

Record each independent review iteration, findings, fixes, contract-diff evidence, security verdict and overall verdict.

## Verification evidence (slice 1)

```text
pnpm --filter api exec tsc --noEmit
pnpm --filter api test
pnpm --filter api test:coverage && pnpm coverage:diff
pnpm typecheck
pnpm openapi:check
git diff --check
```

- `pnpm --filter api test` — 141 suites / 1177 tests passed (includes `openapi.helpers.spec.ts`, `application.factory.spec.ts`, `openapi-contract.spec.ts`).
- `pnpm coverage:diff` — 94/103 changed lines covered (91.26%) vs `origin/main`.
- `pnpm openapi:check` — drift check passed (regenerated JSON + TS types byte-equal to committed artefacts).
- Committed artefacts: `docs/openapi/openapi.json`, `packages/types/src/openapi.generated.ts`.

## Completion summary

Summarize generated artefacts, mounted coverage, compatibility decisions, consuming clients, CI gate, deviations and follow-up domain contract gaps.
