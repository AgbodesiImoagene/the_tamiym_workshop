# Monorepo Structure & Conventions

## Recommended layout (pnpm + turborepo)

- `apps/web` — public marketing site (`www`)
- `apps/app` — customer dashboard (`app`)
- `apps/admin` — admin dashboard (`admin`)
- `apps/api` — NestJS backend
- `packages/ui` — shared UI components (Tailwind + headless primitives)
- `packages/types` — shared TypeScript types (DTOs, enums)
- `packages/config` — eslint/tsconfig/prettier shared
- `docs/ai-implementation-guide` — this guide

## Naming rules

- Prisma models: `PascalCase` (`Order`, `ProductVariant`)
- DB columns: `snake_case` via Prisma mapping if desired, or accept Prisma defaults consistently
- API routes: `/v1/...` with nouns (`/v1/orders`, `/v1/products`)
- Events: `PascalCase` (`OrderPlaced`, `PaymentConfirmed`)
- Shared enums live in `packages/types`

## Frontend rules

- Strictly follow Figma layouts.
- Components should be in `packages/ui` if used by 2+ apps.
- App-specific components stay inside each app under `src/components`.

## Backend rules

- Each domain is a Nest module: `products`, `orders`, `fundraising`, etc.
- Use DTOs + validation (class-validator) and OpenAPI (Swagger) for contract clarity.
- Payment provider must be an interface.
