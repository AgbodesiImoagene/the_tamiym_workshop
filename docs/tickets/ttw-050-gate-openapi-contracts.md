# TTW-050 — Gate OpenAPI and client contracts against drift

**Epic:** 5 — Contracts, observability and release proof  
**Status:** Not started  
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

Record reviewer, date, blast radius, generator/validator choice, operation-ID and normalization rules, compatibility policy, application-factory lifecycle, security/privacy review, tests and verdict before implementation.

## Implementation reviews

Record each independent review iteration, findings, fixes, contract-diff evidence, security verdict and overall verdict.

## Verification evidence

Record exact generation, validation, drift, route-inventory and frontend typecheck commands; attach the intentional contract diff and prove a second generation is byte-identical.

## Completion summary

Summarize generated artefacts, mounted coverage, compatibility decisions, consuming clients, CI gate, deviations and follow-up domain contract gaps.
