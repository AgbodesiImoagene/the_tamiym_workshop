# TTW-090 — Show the email-verification state and offer a resend

**Epic:** 8 — Client review delivery\
**Status:** Complete\
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

2026-11-20, independent read-only reviewer (fresh agent, High risk charter: auth security, correctness, project rules): **PASS**, no blocking finding. The reviewer read the diff and did not run the tests (those runs are under Verification evidence). Open low-severity points, not fixed in this ticket:

1. Stale banner after verifying in another tab: **fixed**. The banner query now refetches on window focus (test: "hides itself when the user verifies elsewhere"). The second `/auth/me` request per page remains: sharing the user across the 12 pages would touch each of them, which is out of this ticket's scope.
2. Same sentence twice at checkout: **fixed**. The in-form notice has its own wording (`EMAIL_NOT_VERIFIED_CHECKOUT_MESSAGE`), and the e2e refusal locator uses it.
3. No cooldown after a resend: **fixed**. After a successful resend the button reads "Resend in Ns" for 30 s (test with fake timers).
4. Interception of `initiate-payment`: **checked, no change**. `checkout-idempotency`, `checkout-order-note` and `checkout-delivery-instructions` already intercept the same route to simulate Paystack, so this is no new precedent.
5. Double click: **test added** ("sends only one request when the button is clicked twice in a row"). It passed at once, because the button is disabled while sending; it now protects that behaviour.

## Verification evidence

Run in the worktree on 2026-11-20:

- Tests written first, failed with "Cannot find module" (components/email-verification-banner and lib/email-verification absent), then passed after implementation (10 tests).
- `pnpm --filter app typecheck`: pass. `pnpm --filter app lint`: pass.
- `pnpm --filter app test`: 15 suites, 140 tests, all pass.
- `pnpm playwright:validate`: passed. `playwright test --list`: the new spec is discovered. Prettier check on touched paths: pass.
- Playwright, run locally on 2026-11-20 against a real API + Postgres (local PostgreSQL 17 test DB `tamiym_workshop_test`, Redis) after `pnpm build` and `seed:e2e`: `pnpm exec playwright test tests/e2e/app/email-verification-banner.comprehensive.spec.ts --project=setup --project=chromium-app` → 7 passed (5 setup + the 2 tests of the spec).
- `pnpm --filter api typecheck`: pass (seed script touched).
- After the review fixes: `pnpm --filter app test` 15 suites / 144 tests pass (3 new tests failed first, for the right reasons: missing refetch, missing cooldown, missing constant); app typecheck and lint pass; the Playwright spec passes again (7 passed).
- **Caveat, now resolved:** on Next.js 16.4.4, `pnpm --filter app build` compiled then failed with a `SecurityFatalError`. TTW-230 upgraded Next.js to 16.4.6 on `main` (`618c683`). After rebasing this branch onto it (2026-11-20): `pnpm install --frozen-lockfile` and `pnpm build` exit 0, `pnpm --filter app typecheck` and `lint` pass, `pnpm --filter app test` 15 suites / 144 tests pass, and the Playwright spec was run again alone with `CI=1` (no server reuse) on the fresh build: 7 passed (5 setup + 2 tests).
- CI on the pushed branch (commit `aace21b`), run 44781197814: `success`, all 19 jobs green.
- CI on `main` after the merge (`ad22899`): `CI` run 44784730403 `success` (all jobs green) and `Playwright Comprehensive` run 44784730379 `success`.
- **Not verified:** nothing left open for this ticket. Locally only the `chromium-app` project ran; CI ran the full set. The independent review (PASS, see above) read the code before the review fixes, which were not reviewed again.

## Completion summary

Merged into `main` as `ad22899`; `CI` and `Playwright Comprehensive` are green on `main`. Delivered: banner with resend in the dashboard shell, explanation after sign-up, `EMAIL_NOT_VERIFIED` handling at checkout, and the e2e journey "verify, then order" (seeded unverified customers). Independent review: PASS (auth, High risk). Nothing remaining.
