# Monorepo Structure & Conventions

## Top-level layout

- `apps/web` - public website, currently mostly scaffold code
- `apps/app` - customer app, currently mostly scaffold code with a few early routes
- `apps/admin` - admin frontend, currently mostly scaffold code with a few early routes
- `apps/api` - NestJS backend and the most developed part of the repo
- `packages/ui` - shared UI package scaffold
- `packages/types` - shared enums and types
- `packages/config` - shared TypeScript, ESLint, and theme config
- `docs` - implementation guide, architecture notes, deployment docs, and readiness trackers
- `assets` - brand assets, screenshots, and design references

## Backend structure

Inside `apps/api/src`, the repo currently uses one folder per domain or platform concern:

- `auth`
- `users`
- `addresses`
- `products`
- `inventory`
- `designs`
- `orders`
- `fundraising`
- `payouts`
- `pricing`
- `media`
- `discounts`
- `bulk-pricing`
- `analytics`
- `admin`
- `mail`
- `storage`
- `prisma`

This is the intended long-term structure and is already reflected in the codebase, even though not every module is mounted directly from `AppModule` yet.

## Naming rules in use

- Prisma models use `PascalCase`
- Nest modules use lower-case folder names with `*.module.ts`, `*.service.ts`, and `*.controller.ts`
- DTOs live under `dto/`
- API routes use the global `/v1` prefix from `main.ts`
- Admin routes are generally grouped under `/v1/admin/...`
- Public fundraising routes use `/v1/public/fundraisers/...`

## Shared-package conventions

- Put repo-wide configuration in `packages/config`
- Put shared enums and portable types in `packages/types`
- Put cross-app UI components in `packages/ui` only when they are actually reused

## Documentation conventions

- Treat docs in `docs/` as repo-state documentation, not aspirational planning
- When backend behavior changes, update:
  - `README.md` if the change affects onboarding
  - `docs/03-backend.md` if the change affects module/runtime behavior
  - `docs/backend-production-readiness.md` if the change affects production readiness

## Current-state warning

The repo structure is ahead of the end-user experience:

- The backend contains many domain modules and tests.
- The frontend apps still present mostly starter content.

Documentation should always make that distinction explicit.
