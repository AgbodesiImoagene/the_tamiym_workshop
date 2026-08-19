# Testing Strategy (High Coverage)

## Goals

- **High confidence** in core business flows: orders, payments, fundraising, admin operations.
- **High coverage** with meaningful assertions (avoid “shallow” tests).
- Automated checks in CI: lint + typecheck + unit + integration + coverage thresholds.

## Test types required

### 1) Unit Tests (fast)

Use for:

- Domain logic (state machines, validation rules)
- Pure services (calculations, transformations)
- Authorization/role guards (logic-level)

Expectations:

- Mock external dependencies (Paystack client, S3, mailer).
- Use deterministic fixtures.
- Focus on edge cases and failure modes.

### 2) Integration Tests (medium)

Use for:

- API endpoints + DB interactions (Prisma + Postgres)
- Webhook handlers with idempotency
- Admin workflows that mutate state
- Query/report endpoints with filters

Expectations:

- Run against a real Postgres instance (Docker).
- Avoid mocking Prisma for these tests.
- Validate DB state transitions (before/after).

### 3) Contract / Schema Tests (recommended)

Use for:

- Ensuring OpenAPI/Swagger schemas match DTOs and don’t break clients.
- Ensuring response shapes remain stable.

Minimum:

- Generate OpenAPI JSON and snapshot it (or validate key routes exist).

### 4) Frontend Tests (scope-aware)

Given time constraints, prioritize:

- Component unit tests for critical UI logic (forms, state transitions)
- Minimal route-level smoke tests (render pages, basic interactions)

Avoid:

- Heavy end-to-end browser automation unless time permits.

## Coverage targets (required)

Set enforceable thresholds in CI.

Backend (`apps/api`):

- Aggregate floors are versioned in `apps/api/coverage-ratchet.json` and enforced by `pnpm coverage:ratchet`.
- Floors are **non-decreasing**: feature tickets that touch executable API code must raise them when measured coverage improves; never lower without an explicit ticket.
- Changed executable lines under `apps/api/src` (excluding specs/generated) must meet `pnpm coverage:diff` (default **80%** vs `origin/main`).
- Long-term aspiration remains high (see historical 85/75/85 targets), but aggregate coverage is a ratchet, not a waiver for ticket-required failure/retry/concurrency tests.

Frontend (`apps/*`):

- Lines: **>= 60%** on critical logic once frontend coverage collection is wired (follow-up); not yet a CI fail gate in TTW-002.

Coverage exemptions:

- Generated files (`apps/api/src/generated/**`, `enums.generated.ts`)
- Simple DTO definitions (only if purely declarative)
  Exemptions must be explicit (no blanket ignores).

## What must be tested (non-negotiable)

### Payments & Webhooks (Paystack)

- Webhook signature verification
- Idempotency: same webhook delivered multiple times must not duplicate:
  - payments
  - order transitions
  - notifications
- Payment success → order transitions from `PENDING_PAYMENT` → `PAID`
- Failure cases: invalid signature, unknown reference, already-processed event

### Orders

- Order creation and line-item correctness
- State transitions allowed/blocked (admin vs system)
- Refund initiation logic (policy-driven) + auditability

### Fundraising

- Campaign creation workflow rules
- Public campaign page access (read-only)
- Campaign totals update as orders complete
- Admin disable/approve logic (if used)

### Designs / Moderation

- Design structured model validation (views/layers)
- Asset upload references (metadata)
- Moderation transitions (PENDING → APPROVED/REJECTED/FLAGGED)
- Admin moderation actions authorization

### Auth & Authorization

- JWT login/logout flows (integration)
- Role protections:
  - customer cannot access admin routes
  - admin can access admin routes
- Organizer capabilities:
  - can create campaigns
  - cannot access admin moderation unless admin

### Analytics & Reporting

- Date range filters produce correct aggregates
- CSV export correctness (headers, row counts)
- Authorization: analytics endpoints restricted to admins

## Test tooling recommendations

### Backend

- Test runner: Jest (Nest default) or Vitest (optional)
- HTTP testing: supertest
- DB: Postgres via docker-compose
- Factories: lightweight factory helpers (hand-rolled or library)

### Integration test pattern

- Start Nest app in test mode
- Use a dedicated test database schema
- Transaction rollback or DB reset strategy per test suite

## CI pipeline (required)

On every PR:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:coverage` (enforce thresholds)
- Build apps (optional but recommended): `pnpm build`

## Development workflow rules

- No payment/webhook or admin mutation code merges without integration tests.
- All bug fixes require a regression test.
- Tests must be deterministic (no network calls; use fakes/mocks).

## Testing environment variables

Provide `.env.test` templates for:

- API DB URL for test DB
- Paystack mock keys (never real)
- Feature flags as needed

## Notes on speed and pragmatism

High coverage is required, but prioritize:

1. correctness of money flows (payments/refunds/payouts)
2. state transitions and authorization boundaries
3. admin operational tooling
4. design saving/editing integrity
