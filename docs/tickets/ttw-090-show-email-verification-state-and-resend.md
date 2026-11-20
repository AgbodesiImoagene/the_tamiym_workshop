# TTW-090 — Show the email-verification state and offer a resend

**Epic:** 8 — Client review delivery\
**Status:** In review (implemented locally, not pushed)\
**Risk:** High\
**Blocked by:** TTW-089\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 1.4, No "email not verified" message in the customer app** (Medium, P1, 3–5 h, status "To do"): After sign-up, nothing tells the user that email verification is required to order, and there is no way to resend the link.

## Proposal

- After sign-up, tell the user that verification is required before ordering.
- Show a banner in the customer app while the email is unverified, with a resend action on `POST /v1/auth/resend-verification`.
- Show the same explanation when checkout refuses an unverified account.

## Invariants

- The API remains the authority for the verified state.

## Implementation plan

1. Start `codex/ttw-090-show-email-verification-state-and-resend` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: banner shown and hidden, resend success, throttled and error states.
- Playwright: sign up, see the message, verify, order.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/app/app/auth/register/page.tsx:68` — row 1.4
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] An unverified user (component tests; not yet played in a browser) understands what to do and can resend the link.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Recorded 2026-11-20, before implementation (High risk: auth).

- Finding confirmed on `main` (20c8c33): `GET /auth/me` returns `emailVerified`, `POST /auth/resend-verification` exists (public, rate-limited, neutral answer), orders answer `403 EMAIL_NOT_VERIFIED`. `apps/app` showed nothing. No API, DTO or OpenAPI change is needed.
- The API stays the authority: the app only reads `emailVerified` and the error code. A hidden banner never grants anything.
- No account enumeration: the resend is called with the email of the signed-in user, and the API answer is the same whether or not the account exists. 429 is shown as "wait a few minutes".
- The banner lives in `CustomerDashboardShell`, so every dashboard page shows it. It reads the user with its own React Query call (`['auth','me']`), so the 12 pages that use the shell did not need changing.
- No new logs or metrics. Nothing sensitive is logged client-side.

## Deviations from the plan

- Sign-up: no separate screen. After sign-up the user lands on `/dashboard`, where the banner states that the email must be verified before ordering.
- Playwright covers sign up → message → resend, and "verify, then order". The link is only in the email, which e2e cannot read, so `seed:e2e` writes a known verification token for one unverified customer per Playwright attempt (2: CI retries once), with a deliverable address. The journey logs in, is refused at checkout with the explanation and the resend button, verifies on the public site, then places the order (Paystack initiation simulated as in the other checkout specs).

## Implementation reviews

Pending.

## Verification evidence

Run in the worktree on 2026-11-20:

- Tests written first, failed with "Cannot find module" (components/email-verification-banner and lib/email-verification absent), then passed after implementation (10 tests).
- `pnpm --filter app typecheck`: pass. `pnpm --filter app lint`: pass.
- `pnpm --filter app test`: 15 suites, 140 tests, all pass.
- `pnpm playwright:validate`: passed. `playwright test --list`: the new spec is discovered. Prettier check on touched paths: pass.
- Playwright, run locally on 2026-11-20 against a real API + Postgres (local PostgreSQL 17 test DB `tamiym_workshop_test`, Redis) after `pnpm build` and `seed:e2e`: `pnpm exec playwright test tests/e2e/app/email-verification-banner.comprehensive.spec.ts --project=setup --project=chromium-app` → 7 passed (5 setup + the 2 tests of the spec).
- `pnpm --filter api typecheck`: pass (seed script touched).
- **Not verified:** only the `chromium-app` project ran (not the other browser tiers or full CI). Independent review not done yet.

## Completion summary

Implemented: banner with resend in the dashboard shell, explanation after sign-up, and `EMAIL_NOT_VERIFIED` handling at checkout. Remaining: independent review (auth, High risk), then CI after a push when asked.
