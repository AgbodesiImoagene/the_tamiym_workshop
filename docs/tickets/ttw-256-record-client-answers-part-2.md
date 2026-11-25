# TTW-256 — Record the client's answers to the part 2 questions

**Epic:** 8 — Client review delivery  
**Status:** In progress  
**Risk:** Low  
**Blocked by:** None  
**Blocks:** None

## Background

The client answered questions 1 to 16 of `revue-client/client-message-open-questions.md` on 2026-11-24. Questions 2 and 3 were forwarded to the owners; 17 to 28 are unanswered. The answers must enter the tracking so tickets do not ask again.

## Proposal

Documentation only. Update the local ROADMAP (decisions and phases), add decision notes to the affected tickets, and create TTW-257 (free shipping), TTW-258 (minimum quantity) and TTW-259 (card only).

Decisions recorded:

| Q          | Answer                                                                              | Effect                                                                         |
| ---------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1          | Fundraising moves after launch                                                      | Phase 7 after launch; only TTW-146 for launch                                  |
| 2, 3       | Forwarded to the owners                                                             | Still open. Print requirements should be as tunable as possible from the admin |
| 4          | Look for owners' font files and licences; meanwhile closest free font               | TTW-177 uses a free replacement                                                |
| 5          | Mastercard and Visa fine, visible logos                                             | TTW-178                                                                        |
| 6          | 5 minute margin OK                                                                  | TTW-223 unblocked                                                              |
| 7          | Remove the Google button                                                            | TTW-113 becomes removal                                                        |
| 8          | Hide icons, official ones to come                                                   | TTW-125                                                                        |
| 9          | Card only for now                                                                   | TTW-259                                                                        |
| 10         | Free shipping above an amount                                                       | TTW-257                                                                        |
| 11, 13, 15 | Confirmed                                                                           | No work                                                                        |
| 12         | Discounts combine                                                                   | TTW-096 confirmed                                                              |
| 14         | Manual refund for now; automatic refund wanted as an admin toggle if no added scope | Kept in v2 (TTW-191)                                                           |
| 16         | Build a minimum quantity                                                            | TTW-258                                                                        |

## Invariants

- No application code changes.

## Implementation plan

1. Update ROADMAP and affected tickets.
2. Create TTW-257 to TTW-259.
3. Run `pnpm docs:validate`.

## Test and observability plan

- `pnpm docs:validate`.

## Acceptance criteria

- [ ] Each answer 1 to 16 appears once in the ROADMAP.
- [ ] Affected tickets carry a dated decision note.
- [ ] `pnpm docs:validate` passes.

## Out of scope

- Implementing TTW-257 to TTW-259.

## Design review

Not required (low risk).

## Implementation reviews

To record.

## Verification evidence

To record.

## Completion summary

To record.
