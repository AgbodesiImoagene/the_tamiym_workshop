# TTW-089 — Add forgot-password and reset-password pages

**Epic:** 8 — Client review delivery\
**Status:** In progress\
**Risk:** High\
**Blocked by:** TTW-083\
**Blocks:** TTW-090

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 1.1, No "forgot password" or password reset pages** (High, P1, 6–10 h, status "To do"): The API exists, but there is no link on any login page. The reset email points to /reset-password, which does not exist (404).

## Proposal

- Add a forgot-password page and a reset page on the surface the email link targets (`/reset-password` on the web app today), using the existing `POST /v1/auth/forgot-password` and `POST /v1/auth/reset-password`.
- Link them from the customer login pages. Follow Figma where a design exists.
- Use Zod and React Hook Form, and model loading, error, expired-link and success states.

## Invariants

- The forgot-password response never reveals whether an account exists.
- A reset closes all sessions (existing behaviour).

## Implementation plan

1. Start `codex/ttw-089-add-forgot-and-reset-password-pages` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: form validation and states.
- Playwright: request, open the emailed link, set a password, sign in.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/auth/auth.service.ts:230` — row 1.1
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer who forgot their password can recover the account from the login page.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Written before implementation, 2026-11-14.

**Finding confirmed on `main` (2684af6).** `apps/api/src/auth/auth.service.ts:249` builds `${FRONTEND_URL}/reset-password?token=…`. `apps/web/app/` has `auth/{login,register,verify}` and `verify-email` only, so the link returns 404. Neither customer login (`apps/web/app/auth/login/page.tsx`, `apps/app/app/auth/login/page.tsx`) links to a reset flow. The API (`forgot-password`, `reset-password`, rate-limited, public) needs no change.

**Decisions.**

- Pages live on the web app, because `FRONTEND_URL` is the web origin: `/auth/forgot-password` (new) and `/reset-password` (the path the email already uses; no API change).
- Both pages are `noindex` (same helper as `verify-email`). The reset page sets `Referrer-Policy: no-referrer` through `metadata.referrer` so the token in the URL is not leaked to third parties, and removes the token from the address bar after reading it.
- Forgot page: always shows the same generic success message after a 2xx, whatever the account state. It never echoes whether the email exists. Network or 429 errors show a retry message.
- Reset page: Zod (same password rules as `ResetPasswordDto` and the register page) with a confirm field. A missing token, or a 400 from the API, shows an "expired or invalid link" state with a link back to the forgot page. Success links to sign-in. The raw token is never logged or put in an error message.
- Session closure on reset is existing API behaviour (invariant); this ticket does not change it.
- `apps/app` login gets the same "Forgot password?" link, pointing at the web page through `NEXT_PUBLIC_WEB_URL`. `apps/admin` is out of scope (privileged accounts, not a customer flow).

**Test strategy (deviation from the ticket's "Component" line).** `apps/web` Jest runs in the `node` environment with no jsdom or Testing Library. Adding them is a dependency and lockfile change outside this ticket. Instead, form rules and error classification live in `apps/web/lib/password-reset.ts` and are unit-tested there. The screens and their states are covered by Playwright.

**E2E token.** The API stores only `sha256(token)` (TTW-083) and keeps raw links out of Redis (TTW-184), so Playwright cannot read the emailed link. The e2e seed inserts, for a dedicated user, `PASSWORD_RESET` rows with known raw tokens (three valid, one per Playwright attempt, and one expired), hashed with sha256 as the API does. The "request" step is still played through the real forgot page against the real API.

**Risks.** Account enumeration (mitigated: generic message, covered by a test); token leakage via referrer, history or logs (mitigated above); regression of login page layout (the new spec opens the login page and follows its new link; `auth-pages.comprehensive.spec.ts` is unchanged).

## Implementation reviews

**Review 1 (independent subagent, 2026-11-14): FAIL.** Security of the pages was sound (no enumeration, no token leak, API assumptions confirmed). Findings, all fixed in the same change:

- B1 (blocker): the "request" step used the seeded reset user, and `forgotPassword` deletes that user's earlier tokens, so the seeded tokens were gone before the reset. Fixed: the request step uses the customer user.
- B2 (blocker): `CardTitle` is a `div`, so the `heading` role assertion could never pass. Fixed: `getByText`.
- H1: the browser matrix would make five projects race for one single-use token. Fixed: the journey is skipped outside `chromium-web`.
- M1: a 400 for a password the API refuses (for example `Password1€`) was shown as an expired link, because the client counted any non-alphanumeric as a symbol. Fixed: same symbol list as validator.js, and a separate `password-rejected` message. Tests were written first and failed (4 failing) before the fix.
- L2, L3, L4 fixed (reload wording, ticket and fixture wording, `aria-label` on Show/Hide of the new page).

**Not fixed, reported for follow-up (outside this ticket):**

- M2: `apps/api/.env.example` documents `FRONTEND_URL` as the customer app (`:3002`), while the reset and verification links assume the web origin. If a deployment follows `.env.example`, `/reset-password` and `/verify-email` return 404. Needs a ticket (separate web and customer-app URLs).
- L1: `apps/app` reads `NEXT_PUBLIC_WEB_URL` for its "Forgot password?" link and falls back to `http://localhost:3000`. The variable must be set in deployment; that link has no Playwright coverage.
- L5: the `customer_auth` rate-limit bucket is shared per IP; the new spec adds three requests.
- L6 (already on `main`): `forgotPassword` only writes and queues when the account exists, so response time could reveal it.
- The register page has the same symbol-regex mismatch (already on `main`).

**Review 2 (independent subagent, 2026-11-15): PASS on the code.** B1, B2, H1 and M1 confirmed fixed. New findings: M-A (the CI plan above was wrong; corrected), M-B (the matrix shares rate limits across browser projects: the unknown address is now unique per project, and the seeded-customer request and the expired-link test run in `chromium-web` only), L-1 (`/reset-password` added to the crawler disallow list next to `/verify-email`), nit (`aria-pressed` removed, `aria-label` kept).

**Follow-ups handled after review 2 (user asked to fix the open points):**

- L-2 fixed: the API now answers a bad, expired or used reset token with the stable code `INVALID_RESET_TOKEN` (`invalidResetTokenError` in `apps/api/src/auth/auth.service.ts`, Swagger and `openapi.json` regenerated). `classifyResetError` decides on that code only, never on the wording. Tests first: 1 API test and 2 web tests failed, then passed.
- M2 fixed: reset and verification links are now built from `WEB_APP_URL`, falling back to `FRONTEND_URL`, so existing environments are unchanged. Two API tests pin it. `.env.example` and `docs/10-deployment-and-environments.md` say so. The Google-linked "settings" link (`/dashboard/settings`) still uses `FRONTEND_URL`, as intended (it is a customer-app route).
- L1 documented: `NEXT_PUBLIC_WEB_URL` is listed in `docs/10-deployment-and-environments.md` as required in deployed environments.

**Still open:**

- L-3: the spec does not check that sessions are closed after a reset, nor that the link reaches the user whose password changes (the request step uses another user, because a request wipes the seeded tokens). Unrun e2e assertions were not added blind.
- The "Forgot password?" link in `apps/app` has no Playwright test.
- Already on `main`, not touched: response time of `forgotPassword` depends on whether the account exists; the register page's symbol regex differs from the API's.

## Verification evidence

Run in the worktree `.claude/worktrees/ttw-089-forgot-reset-password` (Node 24):

- `pnpm --filter web test -- __tests__/password-reset.test.ts`: 18 passed, after 4 failed before the M1 fix. Before the lib existed the suite failed with "Cannot find module '../lib/password-reset'".
- `pnpm test` (whole repo, run before the review fixes): exit 0; web 12 suites, 67 tests passed.
- `pnpm typecheck`: 6 of 6 tasks successful (before the review fixes).
- `pnpm lint`: 0 errors, 14 warnings in `api` (not checked whether any come from the seed edit).
- After the review fixes: `pnpm --filter web test` 12 suites, 72 tests passed; `pnpm --filter web typecheck` and `pnpm --filter web lint` clean; `pnpm format:check`, `pnpm docs:validate`, `pnpm playwright:validate` passed.
- Browser, web dev server on port 3100 with the API deliberately down: login shows "Forgot password?" linking to `/auth/forgot-password`; empty submit shows "Enter a valid email address"; a valid email with the API down shows "Something went wrong. Please try again."; `/reset-password` without token shows the invalid-link state with no form; with `?token=…` the form shows, the token is removed from the address bar, `meta referrer` is `no-referrer` and robots is `noindex`; short and mismatching passwords show both validation messages. The "New password" field had no accessible name until the label was moved onto the input (fixed).

**Not verified:** the Playwright spec `tests/e2e/web/password-reset.comprehensive.spec.ts` has never run. The machine has no Docker or Postgres, so the API and the e2e seed could not start. The real request, reset, single-use and sign-in journey, the session closure after reset, and the "Forgot password?" link in `apps/app` are therefore unplayed. The comprehensive tier does not run on a ticket-branch push: `playwright-comprehensive.yml` runs on `main`, nightly or by `workflow_dispatch`. To prove the spec before merging: bring `main` into the branch (it carries the TTW-218 trigger for `codex/ttw-**` pushes), push when the user asks, then run `gh workflow run playwright-comprehensive.yml --ref codex/ttw-089-add-forgot-and-reset-password-pages` and wait for green.

**After the follow-ups and the merge of `main` (2026-11-15), on the merged tree:** `pnpm typecheck` 6 of 6; `pnpm lint` 0 errors (admin 21 and api 14 warnings, not checked against this diff); API unit suite 151 suites, 1511 tests; web 77 tests; app 120 tests (a first run failed `product-list-page` once under machine load, then passed alone and in the full app run; the file is unrelated to this change); `pnpm format:check`, `pnpm docs:validate`, `pnpm playwright:validate`, `pnpm openapi:check` passed. The merge conflicted in the e2e seed and `identities.ts` with TTW-217's users; both sets were kept.

## Completion summary

Pages, links, tests and seed are written; not complete. Open before closing the ticket: run the Playwright spec against a real API (CI), a second independent review round, and decide the follow-up tickets for M2 and L1.
