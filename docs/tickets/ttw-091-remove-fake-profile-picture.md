# TTW-091 — Remove the fake profile picture and its button

**Epic:** 8 — Client review delivery\
**Status:** Implemented-unverified (relecture indépendante à faire)\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 1.2, Fake profile picture** (Medium, P1, 1–12 h, status "To do"): Every user sees the same demo photo and the "Upload Profile Picture" button does nothing. 1 h to remove the button, 8 to 12 h to build the feature.

Client answers:

- **Q10, Profile picture: build it, or remove the button?** Answer: "Up to you. Happy to remove for simplicity."

## Proposal

- Remove the demo photo and the inactive upload button. Show nothing in their place, or the user's initials if the layout needs it.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-091-remove-fake-profile-picture` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Write the tests first and show them failing for the right reason.
4. Implement the proposal in small steps. Record any deviation here.
5. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: the settings form renders without the image and button.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/app/components/customer-settings-form.tsx:190` — row 1.2
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] No user sees a demo photo or an inactive button in settings (Jest, les deux pages Profile et Settings).
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Required quality gates pass, with evidence recorded below (hors parcours Playwright).

## Out of scope

- Real profile pictures: the client accepts removal (Q10).

## Design review

Not required for a low-risk ticket.

## Implementation reviews

Pending : la relecture indépendante reste à faire avant de clore le ticket.

## Verification evidence

Constat confirmé sur `main` (147d5d5) : image de démo + bouton sans action dans `customer-settings-form.tsx`.

- Test écrit d'abord : `pnpm --filter app test -- settings/customer-settings-form` → 2 échecs attendus (« shows no profile picture and no picture button », pages Profile et Settings : `img alt="Profile"` présente), 19 réussites.
- Après correctif : même commande → `Tests: 21 passed, 21 total`.
- `pnpm --filter app typecheck` → OK, sans erreur.
- `pnpm --filter app lint` → OK, sans erreur.
- `pnpm format:check` → « All matched files use Prettier code style! ».
- `pnpm playwright:validate` → « Playwright manifest validation passed. »
- Playwright : `pnpm build` (5 tâches OK), `prisma migrate deploy` (aucune migration en attente) et `seed:e2e` sur `tamiym_workshop_test`, puis `pnpm exec playwright test tests/e2e/app/settings.comprehensive.spec.ts --project=setup --project=chromium-app` → `14 passed (28.2s)` (3 tailles d'écran ; « profile page reuses settings form controls » inclut les assertions « pas d'image Profile, pas de bouton Profile Picture »).
- `pnpm docs:validate` → « Documentation validation passed. »
- Non lancés : tests API, `pnpm verify`.

## Completion summary

Retiré : l'image de démo, le bouton « Upload/Update Profile Picture », l'entrée `settingsProfilePhoto` de `apps/app/lib/assets.ts` et le fichier `settings-profile-photo.png`. Rien n'a été mis à la place.

Écarts au plan : les tests ont été ajoutés au fichier existant `apps/app/__tests__/settings/customer-settings-form.test.tsx` (pas de nouveau fichier).

Reste à faire : la relecture indépendante. Le chevron « retour » sans action est traité dans un ticket séparé (TTW-228).

À signaler, hors périmètre : le bouton « retour » (chevron) en haut du formulaire n'a pas d'action.
