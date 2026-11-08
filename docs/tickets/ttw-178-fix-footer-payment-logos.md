# TTW-178 — Show only accepted payment methods, legibly, in the public footer

**Epic:** 8 — Client review delivery  
**Status:** Not started  
**Risk:** Low  
**Blocked by:** Client answer: which payment logos the footer should show, and whether PayPal is in the approved Figma (see ROADMAP, "Décisions à obtenir du client")  
**Blocks:** None

## Background

Found during TTW-176 while reviewing the Linux visual baselines of the public home page (2026-11-08, `tests/e2e/visual/*-snapshots/`). The "Payment Methods" column of the footer (`apps/web/components/marketing-shell.tsx:109-133`) shows three logos, two of which are wrong:

1. **The Visa logo is almost invisible.** `apps/web/public/assets/marketing/payment-visa.png` is a dark-blue logo on a transparent background (2400×2400, alpha), drawn on the dark-blue footer (`bg-tamiym-blue`). In the desktop and mobile baselines it reads as a faint smudge next to Mastercard.
2. **PayPal is advertised but not accepted.** The footer shows `payment-paypal.png`, but Paystack is the only payment provider (`docs/06-payments-and-payouts-paystack.md:5`, "Only Paystack is implemented now"; `CLAUDE.md`, "Paystack is the only payment provider"). A supporter who expects to pay with PayPal finds no such option at checkout. The PayPal file also has no transparency (866×650, no alpha), so it shows as a white box.

Side note for whoever picks this up: the three logo files are far larger than their 48×28 px display size (2400×2400, 866×650, 2560×1536). Next.js resizes them, but smaller sources would be cleaner.

## Proposal

To confirm at design review, once the client has answered:

1. Show only methods a customer can actually use through Paystack in Nigeria (for example Mastercard, Visa, Verve, bank transfer, as the client decides), and remove PayPal unless the client says otherwise.
2. Use logo variants that read on the dark footer: the official white or light versions, or each logo on a small light badge, following the card brands' usage rules.
3. Keep the images transparent and sized for their display.

Do not redesign the footer: if Figma shows something else, follow Figma and record the difference here.

## Invariants

- The footer never advertises a payment method that checkout does not offer.
- Every footer logo meets a readable contrast against the footer background.

## Implementation plan

1. Get the client's answer (list of logos; PayPal in or out) and check the approved Figma footer.
2. Replace or add the logo files and update `marketing-shell.tsx`.
3. Regenerate the visual baselines with the `update_snapshots` input of `playwright-matrix.yml`, review them on purpose, and commit them.

## Test and observability plan

- Unit/component: none.
- Integration/e2e: the visual baselines change on purpose and are reviewed; the accessibility scan stays clean; each logo keeps a meaningful `alt`.
- Failure, retry, and concurrency: none.
- Logs, metrics, traces, and alerts: none.

## References

- `apps/web/components/marketing-shell.tsx:109-133` — the "Payment Methods" column.
- `apps/web/lib/assets.ts:9-11` — the logo paths.
- `apps/web/public/assets/marketing/payment-*.png` — the files.
- `docs/06-payments-and-payouts-paystack.md:5` — Paystack only.
- `docs/tickets/ttw-176-run-browser-matrix-in-ci.md` — where the problems were seen.

## Acceptance criteria

- [ ] The client's answer is recorded.
- [ ] The footer shows only accepted payment methods, each clearly visible on desktop and mobile.
- [ ] Visual baselines are regenerated and reviewed on purpose.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Payment methods offered at checkout (Paystack configuration).
- The rest of the footer (social links are TTW-125).

## Design review

Not required for a Low ticket; record the client answer and the Figma check here before implementation.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
