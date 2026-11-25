# TTW-265 — Show a notification when the profile data is saved

**Epic:** Customer app
**Status:** In review
**Risk:** Low
**Blocked by:** None
**Blocks:** None

## Background

On `/dashboard/profile` (and `/dashboard/settings`, same component) saving the personal details, the password or the shipping address shows no confirmation. Errors are only an inline `role="alert"` line, and a failed password change shows nothing (`passwordMutation.mutateAsync` has no catch). `apps/app` already has a reusable notification: `Toaster` (sonner) from `@tamiym/ui`, mounted in `apps/app/app/layout.tsx`, used with `toast` in `components/workshop/SharePanel.tsx`.

## Proposal

Reuse the existing toast. In `apps/app/components/customer-settings-form.tsx` call `toast.success` after each successful save and `toast.error` when a save is refused. Inline errors stay. No new component.

## Invariants

- Inline `role="alert"` errors and existing behaviour of the three forms are unchanged.
- UI text in English.

## Implementation plan

1. Tests first in `apps/app/__tests__/settings/customer-settings-form.test.tsx`.
2. Add the toast calls to the three mutations; catch the password rejection.

## Test and observability plan

- Unit/component: success and error toast for profile, password, address.
- Integration/e2e: manual run on `/dashboard/profile`.

## References

- `apps/app/components/customer-settings-form.tsx` — the three mutations.
- `packages/ui/src/components/ui/sonner.tsx` — the existing Toaster.

## Acceptance criteria

- [ ] A toast confirms a saved profile, password and shipping address.
- [ ] A toast shows the reason when a save is refused (also for the password).
- [ ] Typecheck, lint and tests of `app` pass.

## Out of scope

- Profile picture feedback (`profile-picture-field.tsx`).

## Design review

Low risk: implementation review only.

## Implementation reviews

To do.

## Verification evidence

- `pnpm --filter app test -- customer-settings-form`: 47 passed (6 new tests in "CustomerSettingsForm notifications (TTW-265)", first seen failing).
- `pnpm --filter app typecheck`: OK. `pnpm --filter app lint`: OK.
- Not done: run in the browser (needs a signed-in session); no independent review yet.

## Completion summary

`customer-settings-form.tsx` now shows `toast.success` / `toast.error` for profile, password and address saves. A refused password change no longer fails silently, and the address and password submits catch the rejection. Remaining: browser check, review.
