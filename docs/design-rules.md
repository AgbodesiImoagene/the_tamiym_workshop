# Design Rules & UI Tokens

Design parity and token usage for the Tamiym Workshop frontend. All UI must follow the approved Figma design and shared tokens.

## Source of truth

| Role                        | Location                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Brand / Visual Identity** | `assets/design_rules` — Visual Identity Guidelines (primary/secondary colours, typography, Tamiym Arch, typeface settings) |
| **UI / Screens**            | [Figma — TTW-Site](https://www.figma.com/design/9xmldPK4dDKp72K3oE7tcA/TTW-Site)                                           |
| **Code**                    | `packages/config/theme.css` (Tailwind v4 `@theme`)                                                                         |

Apps `web`, `app`, and `admin` import the shared theme in their `globals.css`; they must not redefine tokens locally.

---

## 1. Use tokens only

- **Do not** hardcode colors, font sizes, spacing, or border radii in components.
- **Do** use Tailwind classes that map to the shared theme, e.g.:
  - `text-primary`, `bg-primary-600`, `text-muted-foreground`
  - `bg-background`, `text-foreground`, `border-border`
  - `rounded-lg`, `rounded-xl`, `font-sans`, `text-sm`, `p-4`
- In custom CSS, use `var(--color-*)`, `var(--radius-*)`, `var(--font-sans)`, etc.

This keeps the UI consistent and allows theme updates (including from Figma) to propagate.

---

## 2. Design parity

- **Do not** redesign. Implement the approved Figma screens and components.
- **Allowed** without changing intent:
  - Responsive spacing (e.g. padding/margins that scale by breakpoint)
  - Truncation/line-clamp where content length is variable
  - Accessible focus states and contrast adjustments that stay within brand
- Any change that alters layout, hierarchy, or visual intent from Figma should be documented and agreed.

---

## 3. Semantic over raw tokens

Prefer semantic tokens so theme changes apply everywhere:

| Prefer                                       | Instead of (when meaning is semantic)                     |
| -------------------------------------------- | --------------------------------------------------------- |
| `text-primary`, `bg-primary`                 | `text-primary-600` (unless a specific step is required)   |
| `text-foreground`, `bg-background`           | Raw grays for main UI surface/text                        |
| `text-muted-foreground`                      | `text-gray-500` for secondary text                        |
| `border-border`, `border-input`              | `border-gray-200` for generic borders                     |
| `text-success`, `text-warning`, `text-error` | Raw green/amber/red when meaning is success/warning/error |
| **Primary action buttons**                   | `bg-accent` / `text-accent` (green) — not `bg-primary`    |
| **Brand / nav / tabs / badges**              | `bg-primary`, `text-primary`, `border-primary` (blue)     |

Use raw scales (e.g. `primary-500`, `gray-700`, `accent-600`) when the design explicitly calls for a specific step or when building gradients/variants.

---

## 4. Adding or changing tokens

1. **Figma first:** Add or update variables/styles in [TTW-Site](https://www.figma.com/design/9xmldPK4dDKp72K3oE7tcA/TTW-Site) so the design file remains the source of truth.
2. **Code:** Add or edit tokens in `packages/config/theme.css` using Tailwind v4 `@theme` namespaces:
   - `--color-*` → `bg-*`, `text-*`, `border-*`, etc.
   - `--font-*` → `font-*`
   - `--radius-*` → `rounded-*`
   - `--text-*` / `--text-*--line-height` → `text-*` (if you define a custom type scale)
3. **Document:** If you introduce new token names or scales, add a short note in this file (e.g. under "Token inventory" or a "Changelog" section) so others know what exists and where it comes from.

---

## 5. Syncing from Figma to code

Figma does not auto-export to CSS. Use one of these approaches:

### Option A: Manual copy from Figma variables

1. In Figma, open **Design** → **Variables** (or **Local variables** in the file).
2. For each variable (colors, spacing, typography, radii):
   - Note the name and value (hex, px, etc.).
   - Map to Tailwind theme names in `packages/config/theme.css`:
     - Color → `--color-<name>` (e.g. `Primary/500` → `--color-primary-500`).
     - Radius → `--radius-<name>` (e.g. `Corner/medium` → `--radius-md`).
     - Font family → `--font-<name>` (e.g. `Body` → `--font-sans`).
3. Update `theme.css` with the Figma values. Keep semantic tokens (e.g. `--color-primary`) pointing to the correct raw token (e.g. `var(--color-primary-600)`).

### Option B: Figma Dev Mode / Inspect

1. Select a component or frame that uses the tokens you need.
2. In the right panel, use **Inspect** / **Dev mode** to see computed styles (fill, text, effects).
3. Copy the reported values (hex, font, radius) into `theme.css` under the matching token names.

### Option C: Export (plugins or API)

If you use a Figma plugin or the Figma API to export variables, map the export format to Tailwind v4 `@theme` variable names and paste or generate the relevant block in `theme.css`.

After any sync, run the apps and do a quick visual check (and any design regression tests) to ensure nothing broke.

---

## 6. Token inventory (reference)

Values in `theme.css` come from **assets/design_rules** (Visual Identity Guidelines) and **assets/figma_screenshots** (UI context).

- **Primary colours (design_rules 2.1):** `white` (#FEFEFE), `dodger-blue` (#1D99FF). Primary scale `primary-50`…`primary-950` is built from Dodger Blue. Semantic `primary` = Dodger Blue.
- **Secondary palette (design_rules 2.2):** `tamiym-blue` (#004385), `tamiym-green` (#45FF70), `tamiym-red` (#B10813), `tamiym-evening-blue` (#AEECEF). Accent scale from Tamiym Green; semantic `accent` = Tamiym Green. `error` = Tamiym Red; `sidebar` = Tamiym Blue.
- **Neutrals:** `gray-50`…`gray-950`.
- **Semantic:** `background` (brand White), `foreground`, `muted`, `muted-foreground`, `border`, `input`, `ring`, `sidebar`, `sidebar-foreground`, `success`, `warning`, `error`.
- **Typography (design_rules 3.0, 3.1, 3.2):** `font-heading` = Neuffila Grotesk (headers, all caps); `font-sans` = Mundial (body, on-screen). `tracking-headline` = -0.03em. Headline sizes: `text-headline-xl`, `text-headline-lg`, `text-headline-md` with matching line-heights.
- **Radii:** `radius-sm`…`radius-2xl`; **Tamiym Arch (design_rules 4.1):** `radius-arch-top` (30pt), `radius-arch-bottom` (10pt) — use for pill-style highlights/tags in Dodger blue, Tamiym Blue, or Tamiym Green.

When you add new tokens, list them here with a one-line description and source (e.g. "design_rules: 2.x" or "Figma: Variables → …").

---

## 7. References

- [04-frontend.md](./04-frontend.md) — Frontend apps and Tailwind token usage
- [.cursor/rules/Design-tokens.mdc](../.cursor/rules/Design-tokens.mdc) — Cursor rule for tokens and parity
- [Tailwind v4 — Theme variables](https://tailwindcss.com/docs/theme)
