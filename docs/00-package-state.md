# Package State Documentation

This document tracks the current state of packages, dependencies, and tooling in the monorepo.

**Last Updated:** M0 Completion

## Monorepo Structure

```
the_tamiym_workshop/
├── apps/
│   ├── web/          # Next.js marketing site (port 3000)
│   ├── app/          # Next.js customer dashboard (port 3002)
│   ├── admin/        # Next.js admin dashboard (port 3003)
│   └── api/          # NestJS backend API
├── packages/
│   ├── config/       # Shared TypeScript, ESLint, Tailwind configs
│   ├── types/        # Shared TypeScript types and enums
│   └── ui/           # Shared UI components (ready for components)
└── docs/             # Documentation
```

## Package Manager & Tooling

- **Package Manager:** pnpm 9.0.0
- **Build System:** Turborepo 2.7.5
- **Node Version:** >=18.0.0
- **TypeScript:** 5.9.3

## Apps

### `apps/web` (Next.js Marketing Site)

- **Framework:** Next.js 16.1.4
- **Port:** 3000
- **Features:**
  - Tailwind CSS v4 (CSS-based config)
  - TypeScript strict mode
  - ESLint with Next.js config
  - Shared packages: `@tamiym/ui`, `@tamiym/types`, `@tamiym/config`

### `apps/app` (Next.js Customer Dashboard)

- **Framework:** Next.js 16.1.4
- **Port:** 3002
- **Features:**
  - Tailwind CSS v4 (CSS-based config)
  - TypeScript strict mode
  - ESLint with Next.js config
  - Shared packages: `@tamiym/ui`, `@tamiym/types`, `@tamiym/config`

### `apps/admin` (Next.js Admin Dashboard)

- **Framework:** Next.js 16.1.4
- **Port:** 3003
- **Features:**
  - Tailwind CSS v4 (CSS-based config)
  - TypeScript strict mode
  - ESLint with Next.js config
  - Shared packages: `@tamiym/ui`, `@tamiym/types`, `@tamiym/config`

### `apps/api` (NestJS Backend)

- **Framework:** NestJS 11.0.1
- **Port:** 3001 (to be configured)
- **Features:**
  - TypeScript strict mode
  - ESLint with TypeScript ESLint
  - Shared packages: `@tamiym/types`, `@tamiym/config`
- **Status:** Basic scaffold complete, M1 in progress

## Shared Packages

### `packages/config`

- **Purpose:** Shared configuration files
- **Exports:**
  - `tsconfig.json` - Base TypeScript configuration
  - `eslint.config.js` - ESLint configuration
  - `tailwind.config.js` - Tailwind CSS configuration (v3 format for reference)
- **Dependencies:**
  - `@typescript-eslint/eslint-plugin`
  - `@typescript-eslint/parser`
  - `eslint`
  - `eslint-config-next`
  - `eslint-config-prettier`

### `packages/types`

- **Purpose:** Shared TypeScript types and enums
- **Exports:**
  - `UserRole` enum (CUSTOMER, ORGANIZER, ADMIN)
  - `OrderStatus` enum
  - `PaymentStatus` enum
  - `CampaignStatus` enum
  - `ModerationStatus` enum
  - Base entity interfaces
  - Paginated response types
- **Dependencies:** None (pure TypeScript)

### `packages/ui`

- **Purpose:** Shared React UI components
- **Status:** Scaffold ready, components to be added
- **Dependencies:**
  - `react` ^18.2.0
  - `react-dom` ^18.2.0
  - `tailwindcss` ^3.4.0

## Development Tools

### Code Quality

- **Prettier:** 3.8.1 (formatting)
- **ESLint:** Configured per app/package
- **Husky:** 9.1.7 (git hooks)
- **lint-staged:** 15.5.2 (pre-commit linting)

### Pre-commit Hooks

- **Location:** `.husky/pre-commit`
- **Action:** Runs `pnpm exec lint-staged`
- **Lint-staged config:** `.lintstagedrc.json`
  - Lints and formats `.ts`, `.tsx`, `.js`, `.jsx` files
  - Formats `.json`, `.md` files

## CI/CD

### GitHub Actions

- **Workflow:** `.github/workflows/ci.yml`
- **Jobs:**
  - `typecheck` - TypeScript type checking
  - `lint` - ESLint + Prettier check
  - `test` - Unit tests
- **Triggers:** Push/PR to `main` or `develop` branches

## Tailwind Configuration

All Next.js apps use Tailwind CSS v4 with CSS-based configuration:

- Theme tokens defined in `app/globals.css` using `@theme inline`
- Primary color palette (50-900)
- Neutral gray scale (50-900)
- Font families: Inter (sans), system fonts
- **Note:** Colors are placeholder values; to be updated from Figma design tokens

## Scripts

### Root Level (`pnpm`)

- `dev` - Run all apps in development mode
- `build` - Build all apps
- `lint` - Lint all packages
- `typecheck` - Type check all packages
- `test` - Run all tests
- `test:integration` - Run integration tests
- `test:coverage` - Run tests with coverage
- `format` - Format all files with Prettier
- `format:check` - Check formatting
- `db:migrate` - Run Prisma migrations (api app)
- `db:seed` - Seed database (api app)

## Environment Setup

### Required

- Node.js >=18.0.0
- pnpm >=9.0.0
- Docker + Docker Compose (for local services)

### Local Services (Docker Compose)

- PostgreSQL (required)
- Redis (optional, recommended)
- OpenTelemetry Collector (optional, recommended)

## Next Steps (M1)

1. Set up Prisma with PostgreSQL
2. Configure NestJS with global validation pipe
3. Create auth module skeleton
4. Set up Swagger/OpenAPI documentation
5. Add health endpoint
6. Configure structured logging and OpenTelemetry baseline
