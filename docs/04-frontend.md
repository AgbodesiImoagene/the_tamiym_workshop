# Frontend — Next.js (3 apps) + Tailwind

## Apps

- `apps/web` — marketing pages (public)
- `apps/app` — customer dashboard + design workshop
- `apps/admin` — admin dashboard

All share:

- `packages/ui` (components)
- `packages/types` (DTOs/enums)
- Tailwind config tokens (colors, spacing, typography aligned to Figma)

## State & data fetching

- React Query for server state
- React Hook Form for forms
- Minimal local state (Zustand only where needed, e.g. design workshop session state)

## Routing conventions

- Public pages under `/`
- Auth pages under `/auth/*`
- Dashboard under `/dashboard/*` (or direct sections to match Figma)
- Admin under `/admin/*` inside admin app

## Accessibility & UX

- Keyboard navigation for key actions
- Clear empty states and error states (as per PRD NFRs)
- Responsive behavior: sidebar collapses appropriately

## Component mapping

- Product cards, variant selectors, swatches
- Order list + order detail components
- Fundraiser wizard components (select/design → story → settings)
- Admin tables: orders/products/inventory/moderation + filters
