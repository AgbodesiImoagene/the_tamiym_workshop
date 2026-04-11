/**
 * Shared Tailwind config for packages that extend it (e.g. @tamiym/ui).
 *
 * Design tokens (colors, typography, radii) live in theme.css and are consumed
 * by apps via @import "@tamiym/config/theme.css". Do not duplicate theme
 * values here — use theme.css as the single source of truth.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {},
  },
  plugins: [],
};
