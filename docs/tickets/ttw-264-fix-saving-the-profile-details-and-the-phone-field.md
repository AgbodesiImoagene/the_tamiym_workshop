# TTW-264 — Fix saving the profile details and restrict the phone field

**Epic:** 2B — Customer app polish  
**Status:** In review  
**Risk:** Standard  
**Blocked by:** None  
**Blocks:** None

## Background

Reported by the product owner on `/dashboard/profile`: saving the personal details fails, the browser shows an unhandled error (`coerceError` / `onUnhandledRejection` in the Next overlay), and the phone field should accept only "+" and digits.

Cause, confirmed by running the API validator on `UpdateProfileDto` (`apps/api/src/users/dto/update-profile.dto.ts`, `@IsPhoneNumber()` with `@IsOptional()`):

| Phone sent            | API           |
| --------------------- | ------------- |
| `""` (empty)          | refused (400) |
| `08012345678` (local) | refused       |
| `+2348012345678`      | accepted      |
| not sent              | accepted      |

`CustomerSettingsForm` (`apps/app/components/customer-settings-form.tsx`) sent `phone: values.phone` every time, so a customer **without a phone number** (the usual case) could not save any change, even a new name. The rejection of `mutateAsync` was not caught, so it surfaced as an unhandled rejection, and nothing was shown on the page (the address form already shows its errors; the personal form did not).

## Proposal

- Product owner's decision (2026-11-25): the phone is a **country selector with its calling code** next to a field that takes **digits only**; the international number is built from them. The selector lists every country ("Nigeria (+234)", in alphabetical order, Nigeria selected by default). The selector is a button that opens a dropdown with a **search field inside it** (focused on opening): digits match the start of the calling code ("44" or "+44"), letters match the name; arrow keys and Enter choose, Escape closes; the chosen country is checked and the list opens on it; "No country matches." when nothing does using `libphonenumber-js` (`/max`, the library `class-validator` uses in the API, so what the form accepts the API accepts). The library was already in the lockfile; it is now an explicit dependency of `apps/app` (3 lines in `pnpm-lock.yaml`).
- On save the digits are parsed with the selected country into E.164 (`+2348012345678`); a local number with its leading 0 (`08012345678`) becomes `+2348012345678`. A number that is not valid for the country is refused in the page ("Enter a valid phone number for the selected country.") and nothing is sent. A saved number is shown as its country and its national digits.
- An empty phone is "no phone": it is not sent.
- The rejection of a save is caught and shown under the form (a phone refusal gets the same plain explanation). Nothing is left unhandled.
- The API is unchanged.

Not done: clearing an existing phone is still not possible (the API has no way to clear it; unchanged). A generic `Popover` was added to `@tamiym/ui` (Radix, no new dependency). The country names come from the browser (`Intl.DisplayNames`, English).

## Invariants

- First name, surname and email behave as before; the email stays read-only.
- The shipping address form and the password form are untouched.

## Implementation plan

1. Tests first in `apps/app/__tests__/settings/customer-settings-form.test.tsx` (5 failing for the right reason).
2. Phone sanitising, zod schema, `try/catch` and the error message in `customer-settings-form.tsx`.
3. Playwright spec `tests/e2e/app/profile-details.comprehensive.spec.ts` against the real API; listed in the manifest.

## Test and observability plan

- Component: saving a name with no phone sends no `phone`; the selector lists the countries with their code in alphabetical order; the dropdown opens with its own search, which narrows the list by code or by name, works with the keyboard and says when nothing matches; the field keeps only digits; digits plus country become the international number (also with a leading 0 and for another country); a saved number is split into country and digits; an invalid number is refused and nothing is sent; a refusal of the API is shown and a phone refusal is explained.
- E2E: a registered customer saves a name with no phone (200), types `abc0801-234 5678` (digits only: `08012345678`), saves and the request carries `+2348012345678` (200), reloads and sees Nigeria and `8012345678`, then an invalid number for another country is refused in the page.

## References

- `apps/api/src/users/dto/update-profile.dto.ts` — phone validation.
- `apps/app/components/customer-settings-form.tsx` — personal details form.

## Acceptance criteria

- [x] A customer without a phone can save a new name (component test; e2e written).
- [x] The phone field takes digits only and sits next to a country selector; the international number is built on save (component tests).
- [x] A refused save is shown, and no unhandled rejection remains (component test).
- [ ] Playwright spec run against the real API (see Verification evidence).

## Out of scope

- Converting local numbers to `+234`, clearing a saved phone, validating phones server-side differently (API unchanged).

## Design review

Standard, small blast radius (one component and its tests). The API contract is unchanged on purpose.

## Implementation reviews

None yet.

## Verification evidence

- Reproduction first: the 5 new component tests failed before the change (phone sent empty, no sanitising, no error shown) and pass after it.
- `pnpm --filter app test` and lint: see the completion run.

## Completion summary

To fill in.
