# TTW-123 — Add the public catalogue and align the site menu

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** TTW-092\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 2.4, No public catalogue; menu differs from Figma** (High, P1, 15–25 h, status "To do"): The public site has no Products page. Figma menu: Products, Workshop, Design, About.

Client answers:

- **Q48, Site menu: follow Figma (Products, Workshop, Design, About) or keep the current one (Bulk orders, Fundraisers, Workshop, About)?** Answer: "Most coherent user experience should be the north star."

## Proposal

- Add a public Products page on `apps/web`, with `lib/catalog.ts` as a starting point.
- Choose the menu that gives the most coherent experience (Q48), and record the choice.
- Buying continues in the customer app, which keeps the cart there.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-123-add-public-catalogue-and-site-menu` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Validators: public IA, SEO and structured data.
- Playwright: browse the public catalogue and reach the customer app.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/web/lib/catalog.ts:20 (unused)` — row 2.4
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A visitor can browse products without an account.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Merging cart and checkout into `apps/web` → TTW-055, which stays deferred.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
