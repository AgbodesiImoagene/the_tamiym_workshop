# Frontend — Next.js (3 apps) + Tailwind

## Apps

- `apps/web` — marketing pages (public)
- `apps/app` — customer dashboard + design workshop
- `apps/admin` — admin dashboard

Recommended boundary:

- `apps/web` should also own fundraiser-scoped shopping and checkout so public campaign traffic can stay on the public site through purchase completion
- `apps/app` remains the authenticated customer and organizer workspace (profile, addresses, order history, design workshop, campaign management)
- `apps/admin` remains the internal operations console and should not be treated as just another customer-facing session surface

See `14-auth-and-session-architecture.md` for the detailed rationale and session-sharing model.

All share:

- `packages/ui` (components)
- `packages/types` (DTOs/enums)
- **Design tokens:** `packages/config/theme.css` (Tailwind v4 `@theme`; colors, typography aligned to [TTW-Site Figma](https://www.figma.com/design/9xmldPK4dDKp72K3oE7tcA/TTW-Site)). Each app imports it in `globals.css`. See `docs/design-rules.md` for rules and sync instructions.

## State & data fetching

- React Query for server state
- React Hook Form for forms
- Minimal local state (Zustand only where needed, e.g. design workshop session state)

## Routing conventions

- Public pages under `/`
- Auth pages under `/auth/*`
- Dashboard under `/dashboard/*` (or direct sections to match Figma)
- Admin under `/admin/*` inside admin app
- Admin moderation currently has dedicated queues under `/admin/moderation/campaigns`, `/admin/moderation/designs`, and `/admin/moderation/media`, with campaign review linking directly into the design moderation detail flow for blocked artwork.

## Accessibility & UX

- Keyboard navigation for key actions
- Clear empty states and error states (as per PRD NFRs)
- Responsive behavior: sidebar collapses appropriately

## Component mapping

- Product cards, variant selectors, swatches
- Order list + order detail components
- Fundraiser wizard components (select/design → story → settings)
- Admin tables: orders/products/inventory/moderation + filters
