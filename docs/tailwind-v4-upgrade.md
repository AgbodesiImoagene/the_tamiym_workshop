# Tailwind CSS v4 – manual steps from the upgrade guide

Reference: [Tailwind v4 Upgrade guide](https://tailwindcss.com/docs/upgrade-guide).

## Done

- **Apps** already use v4-style setup: `@import "tailwindcss"`, `@theme inline` in `globals.css`, and `@tailwindcss/postcss` in PostCSS config.
- **packages/ui**: `npx @tailwindcss/upgrade --force` updated the `tailwindcss` dependency to v4. There is no CSS entry in this package (Tailwind is used by the apps that consume it).
- **Utility renames** applied in apps:
  - `shadow` → `shadow-sm` (default shadow)
  - `shadow-sm` → `shadow-xs` (small shadow)
  - `focus:outline-none` → `focus:outline-hidden` (hide focus outline; keeps accessibility behavior)

## Optional manual steps you can run

1. **Run the upgrade tool from each app** (if you want the tool to touch app CSS/PostCSS):

   ```bash
   cd apps/web && npx @tailwindcss/upgrade
   cd apps/app && npx @tailwindcss/upgrade
   cd apps/admin && npx @tailwindcss/upgrade
   ```

   Apps already use v4 imports and PostCSS; the tool may only adjust dependency versions or suggest tweaks.

2. **Use a JS config from CSS (only if you rely on a shared `tailwind.config.js`)**  
   v4 does not auto-detect JS config. If an app should use e.g. `packages/config/tailwind.config.js`, add at the top of that app’s main CSS:

   ```css
   @config "../../packages/config/tailwind.config.js";
   ```

   Right now the apps use `@theme inline` in their own `globals.css`, so this is optional.

3. **Check for other renamed utilities** (search the codebase and fix if present):
   - `rounded-sm` → `rounded-xs`, `rounded` → `rounded-sm`
   - `blur-sm` → `blur-xs`, `blur` → `blur-sm`
   - `drop-shadow-sm` → `drop-shadow-xs`, `drop-shadow` → `drop-shadow-sm`
   - `backdrop-blur-sm` → `backdrop-blur-xs`, `backdrop-blur` → `backdrop-blur-sm`
   - Bare `ring` (e.g. `focus:ring`) → `ring-3` if you relied on the old 3px default
   - `!` important modifier: v4 prefers at the end of the class, e.g. `flex!` instead of `!flex`

4. **Space/divide utilities**  
   If you use `space-x-*` / `space-y-*` or `divide-x-*` / `divide-y-*` with custom margins on children, review the new selectors (see upgrade guide) and consider switching to `gap` where it simplifies layout.

5. **Hover on touch**  
   v4’s `hover` only applies when the primary input supports hover. If you depend on tap-to-show-hover on mobile, add a custom variant (see guide).

6. **Browser support**  
   v4 targets Safari 16.4+, Chrome 111+, Firefox 128+. If you need older browsers, stay on v3.4.

7. **Vite apps**  
   If an app uses Vite, you can switch from the PostCSS plugin to `@tailwindcss/vite` for better DX (see upgrade guide).
