# TTW-252 — Turn off the AI screening of designs and campaigns

**Epic:** 2 — Security and trust boundaries\
**Status:** Implemented on branch `codex/ttw-252-turn-off-ai-screening`, not merged\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

Found while closing TTW-109 (2026-11-22). The client says the admin alone validates content, but the code still sends every design save and every campaign submission to the AI moderation service (OpenAI) and acts on its verdict:

- `apps/api/src/designs/designs.service.ts` — `moderateDesign` runs on create, on a content update and on a thumbnail upload. The verdict becomes the design's `moderationStatus` (it can auto-approve) and an AI decision is recorded.
- `apps/api/src/fundraising/campaigns.service.ts` — `submitForReview` calls `moderateText`. An AI "rejected" verdict sends the campaign back to DRAFT and e-mails the organiser; any other verdict moves it to REVIEW.

The decision (user, 2026-11-22): switch this off for now, the client may ask for it later. Uploaded images (media processor) keep their own screening and are out of scope.

## Proposal

- One setting, `AI_SCREENING_ENABLED`, off unless set to `true` or `1`. No code is deleted, so turning it back on is a configuration change.
- When it is off, the two call sites above do not call the AI. They use the result the service already uses when the AI is unavailable: status PENDING, no score, notes "AI screening is turned off". The item then waits for the admin.
- Rejected alternative: commenting the code out. It leaves dead code to maintain and a manual edit to undo.
- Shared helper in `apps/api/src/moderation/` so both services read the setting the same way.

## Invariants

- With the setting off, no design or campaign text leaves the system for the AI, and no design or campaign is auto-approved or auto-rejected.
- With the setting on, behaviour is exactly the current one.
- A new thumbnail never makes an unscreened picture public: PENDING is stricter than APPROVED, so the existing "a new picture can only tighten the status" rule demotes an APPROVED design to PENDING until an admin looks at it.
- Image upload screening is unchanged.

## Implementation plan

1. Start `codex/ttw-252-turn-off-ai-screening` from current `main`, in its own worktree.
2. Record the design review below.
3. Write the tests first and show them failing for the right reason: helper, designs (create, update, thumbnail), campaign submission.
4. Add the helper and wire `DesignsService` and `CampaignsService`.
5. Document the setting (`.env.example`) and the moderation policy doc.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: helper parsing; designs and campaigns with the setting off (no AI call, PENDING, decision recorded as PENDING) and on (existing behaviour, existing tests kept).
- Integration/e2e: none new; the API e2e suite already runs without an AI key, which behaves like "off".
- Logs, metrics, traces, and alerts: a log line at debug level when a screening is skipped. No design text, no PII.

## References

- `apps/api/src/designs/designs.service.ts` — `moderateDesign`, `uploadThumbnail`, `stricterStatus`.
- `apps/api/src/fundraising/campaigns.service.ts` — `submitForReview`.
- `apps/api/src/moderation/moderation.service.ts` — the service already degrades to PENDING without `OPENAI_API_KEY`.
- `apps/api/src/fundraising/campaign-readiness.service.ts` — a design must be APPROVED before a campaign can be activated.
- `docs/tickets/ttw-109-send-design-approved-and-rejected-emails.md` — where this was noticed.

## Acceptance criteria

- [x] With `AI_SCREENING_ENABLED` unset, creating or updating a design, uploading its thumbnail and submitting a campaign never call the AI, and the items wait for an admin (PENDING / REVIEW).
- [x] With `AI_SCREENING_ENABLED=true`, behaviour is unchanged.
- [x] Image upload screening is unchanged.
- [x] The setting and its consequences are documented.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Screening of uploaded images (media processor).
- Whether the AI screening should come back, and in what form: a client decision for later.
- A way to approve designs in bulk, if the admin queue becomes long.

## Design review

Date: 2026-11-22. Reviewer: the author, after reading the three call sites and their unit tests.

- **Blast radius.** Two services (`DesignsService`, `CampaignsService`), one new helper, the config documentation. `ModerationService` is not touched: the media processor shares it for uploaded images and must keep working.
- **Duplication check.** The "AI unavailable" result already exists as `ModerationService.fallback` (private) and is what both flows get today when `OPENAI_API_KEY` is missing. The helper returns the same shape (PENDING, score 0). No new status, no schema change, no migration.
- **Where the check lives.** In the two callers, not inside `ModerationService.moderate`, because `moderate` is also used for images. `DesignsService` already has `ConfigService`; `CampaignsService` gets it as a new dependency.
- **Edge cases.**
  - Update with changed content: the design goes to PENDING with a new revision hash, as when no text and no picture can be screened today.
  - Thumbnail upload: the existing `stricterStatus` rule turns an APPROVED design into PENDING, so a new unscreened picture is never public. Consequence for the admin queue: because the workshop uploads a thumbnail on each save, an APPROVED design that its owner saves again returns to PENDING and needs a new approval. This is the safe reading and is documented, not hidden.
  - Campaign submission: PENDING takes the existing "move to REVIEW" branch; there is no AI auto-reject path and no "rejected" e-mail.
  - AI decisions are still recorded, with outcome PENDING and the note "AI screening is turned off", exactly as for an unavailable AI.
  - Campaign activation still needs the design APPROVED: an admin must approve each design before a campaign can go live.
- **Risks.** More work for admins (every design waits). Accepted by the user. A misspelt value of the setting counts as off, which is the safe direction.
- **Tests.** Existing AI-on tests keep their assertions: their setup now sets `AI_SCREENING_ENABLED=true`, because they describe the AI-on behaviour. New tests cover the off case.
- **Verdict.** Approved to implement.

## Implementation reviews

Review 1 (2026-11-22, `/code-review` at high effort, one reviewer; charter: correctness, cleanup, conventions of the whole diff). 5 findings:

| #   | Finding                                                                                                                                                                            | Outcome                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | With the screening off, a thumbnail upload turns an APPROVED design back to PENDING, including one used by a live campaign, whose public picture closes until an admin re-approves | Kept, and recorded as a consequence for the client to know (see Completion summary). It is the existing rule "no unscreened public picture"; the only new thing is how often it fires.                                                                     |
| 2   | The audit note and admin-facing texts say "AI pre-screen: PENDING" although nothing ran                                                                                            | Fixed for the audit note ("AI pre-screen skipped (turned off)") and the admin design page text. Not changed: the default admin e-mail template and the event description in `admin-notifications/` (stored, editable templates, a separate piece of work). |
| 3   | A misspelt value of the setting is silently off, no log                                                                                                                            | Not changed: the safe direction, documented. A warning needs a startup hook for one setting.                                                                                                                                                               |
| 4   | The "is it on?" branch is written in two services                                                                                                                                  | Not changed: two callers, three lines each; a shared wrapper would hide the different off-handling (design vs campaign).                                                                                                                                   |
| 5   | A new campaign test reached a private field through a cast                                                                                                                         | Fixed: the spec exposes its own mock.                                                                                                                                                                                                                      |

No second reviewer: the charter does not differ (no money, no schema).

## Verification evidence

Run in the worktree, 2026-11-22.

- Failing first: with the new tests and no implementation, `pnpm --filter api test -- src/designs/designs.service.spec.ts src/moderation/ai-screening.spec.ts` gave 7 failed in the designs spec (the AI was still called) plus the helper spec failing to import; `src/fundraising/campaigns.service.spec.ts` gave 5 failed. One campaign test passed before the fix because its mocks always return REVIEW; it was rewritten to assert that nothing is sent back to DRAFT and no refusal is queued, and then failed for the right reason.
- After the fix: `pnpm --filter api test`: 184 suites, 2326 tests passed.
- The existing AI-on tests keep every assertion. Their setup now sets `AI_SCREENING_ENABLED=true` (designs spec, campaigns spec) and the campaigns spec module gained a `ConfigService` provider, because `CampaignsService` has a new `ConfigService` dependency.
- `pnpm --filter api typecheck`, `pnpm --filter admin typecheck`: no error. `pnpm --filter api lint`: 0 errors, 14 warnings; `pnpm --filter admin lint`: 0 errors, 22 warnings (both unchanged).
- `pnpm format:check`, `pnpm docs:validate`, `pnpm openapi:check` passed. No endpoint or DTO changed.
- `pnpm --filter api test:coverage`, then `pnpm coverage:ratchet` passed and `pnpm coverage:diff` passed: 10/10 changed lines covered against `origin/main`.
- API integration, with the real Postgres: `campaign-authoring`, `design-content-validation`, `moderation-appeals`, `order-saved-designs`: 4 suites, 19 tests passed. These run without an AI key, which already behaved like "off".

Not verified: the admin screens in a browser with the setting off (no new UI, one text changed); behaviour against the real AI with the setting on (the unit tests mock it); the Playwright suites.

## Completion summary

New setting `AI_SCREENING_ENABLED` (off unless `true` or `1`). While off, creating or editing a design, uploading its thumbnail and submitting a campaign send nothing to the AI: designs are PENDING and campaigns go to REVIEW for the admin, with no automatic approval or refusal. Uploaded images keep their screening. Turning the screening back on is a configuration change. Files: `moderation/ai-screening.ts`, `designs.service.ts`, `campaigns.service.ts`, specs, `docs/03-backend.md`, `docs/backend-production-readiness.md`, `apps/api/.env.example`.

To tell the client:

- Every design now needs an admin approval before a campaign can use it.
- A new thumbnail returns an APPROVED design to PENDING. The workshop uploads one on each save, so an approved design that its owner saves again waits for a new approval, and its public picture is closed until then. This includes designs of live campaigns. If that is too strict, the next step is a product decision (for example, no demotion when only the picture changes).
- The default admin e-mail template for "campaign submitted" still prints "AI pre-screen: PENDING".

Not done here: ROADMAP and README (the ticket has no row in either yet), push, merge.
