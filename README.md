# Tamiym Workshop

A custom design and fundraising platform built with Next.js, NestJS, and Prisma.

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18.0.0 (LTS recommended - use [nvm](https://github.com/nvm-sh/nvm) for version management)
- **pnpm** >= 9.0.0 ([Installation guide](https://pnpm.io/installation))
- **Docker** and **Docker Compose** (for local services)
- **Git**

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd the_tamiym_workshop
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   Copy the example environment file for the API:

   ```bash
   cp apps/api/.env.example apps/api/.env.local
   ```

   Edit `apps/api/.env.local` and update the values:
   - `DATABASE_URL` - PostgreSQL connection string
   - `JWT_ACCESS_SECRET` - Secret key for JWT tokens
   - `JWT_REFRESH_SECRET` - Secret key for refresh tokens
   - Other required variables (see [Environment Variables](#environment-variables))

4. **Start local services (Docker)**

   ```bash
   docker-compose up -d
   ```

   This starts:
   - PostgreSQL (port 5432)
   - Redis (port 6379) - optional but recommended
   - OpenTelemetry Collector (port 4318) - optional

5. **Set up the database**

   ```bash
   # Run migrations
   pnpm db:migrate

   # Seed the database with sample data
   pnpm db:seed
   ```

6. **Start development servers**

   ```bash
   pnpm dev
   ```

   This starts all apps in development mode:
   - **API**: http://localhost:3001
   - **Web (Marketing)**: http://localhost:3000
   - **App (Customer Dashboard)**: http://localhost:3002
   - **Admin Dashboard**: http://localhost:3003

## 📁 Project Structure

This is a monorepo managed with **pnpm workspaces** and **Turborepo**.

```
the_tamiym_workshop/
├── apps/
│   ├── api/          # NestJS backend API (port 3001)
│   ├── web/          # Next.js marketing site (port 3000)
│   ├── app/          # Next.js customer dashboard (port 3002)
│   └── admin/        # Next.js admin dashboard (port 3003)
├── packages/
│   ├── config/       # Shared TypeScript, ESLint, Tailwind configs
│   ├── types/        # Shared TypeScript types and enums
│   └── ui/           # Shared React UI components
├── docs/             # Detailed documentation
├── .github/          # GitHub Actions workflows
└── .husky/           # Git hooks
```

### Apps

- **`apps/api`**: NestJS backend with Prisma ORM
  - RESTful API with OpenAPI/Swagger documentation
  - JWT-based authentication
  - Role-based access control (CUSTOMER, ORGANIZER, ADMIN)
  - Swagger UI available at `/docs`

- **`apps/web`**: Public marketing website
  - Next.js 16 with App Router
  - Tailwind CSS v4

- **`apps/app`**: Customer dashboard
  - Product browsing and design workshop
  - Order management
  - Fundraising campaigns

- **`apps/admin`**: Admin dashboard
  - Order management
  - Product/inventory management
  - Moderation tools
  - Analytics and reporting

### Shared Packages

- **`packages/config`**: Shared configuration
  - TypeScript base config
  - ESLint rules
  - Tailwind theme configuration

- **`packages/types`**: Shared TypeScript types
  - Enums (UserRole, OrderStatus, PaymentStatus, etc.)
  - Common interfaces
  - DTO types

- **`packages/ui`**: Shared UI components
  - Reusable React components
  - Tailwind-styled components

## 🛠️ Available Scripts

### Root Level Commands

Run these from the repository root:

```bash
# Development
pnpm dev              # Start all apps in development mode
pnpm build            # Build all apps for production
pnpm start            # Start all apps in production mode

# Code Quality
pnpm lint             # Lint all packages
pnpm typecheck        # Type check all packages
pnpm format           # Format code with Prettier
pnpm format:check     # Check code formatting

# Testing
pnpm test             # Run all unit tests
pnpm test:integration # Run integration tests
pnpm test:coverage    # Run tests with coverage report

# Database
pnpm db:migrate       # Run Prisma migrations
pnpm db:seed          # Seed database with sample data
```

### App-Specific Commands

Run commands for a specific app using pnpm filters:

```bash
# API
pnpm --filter api dev
pnpm --filter api build
pnpm --filter api test

# Web
pnpm --filter web dev
pnpm --filter web build

# App
pnpm --filter app dev
pnpm --filter app build

# Admin
pnpm --filter admin dev
pnpm --filter admin build
```

## 🔐 Environment Variables

### API (`apps/api/.env.local`)

Required variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/tamiym_workshop?schema=public"

# JWT Authentication
JWT_ACCESS_SECRET="your-access-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret-key"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Server
PORT=3001
NODE_ENV=development

# Logging
LOG_LEVEL=info
```

Optional variables:

```env
# Paystack (for payments)
PAYSTACK_SECRET_KEY="your-paystack-secret-key"
PAYSTACK_PUBLIC_KEY="your-paystack-public-key"
PAYSTACK_WEBHOOK_SECRET="your-webhook-secret"

# S3 Storage (for design uploads)
S3_ENDPOINT=""
S3_BUCKET=""
S3_ACCESS_KEY=""
S3_SECRET_KEY=""

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"

# CORS
CORS_ORIGIN="http://localhost:3000,http://localhost:3002,http://localhost:3003"
```

See `apps/api/.env.example` for a complete template.

## 🗄️ Database Setup

### Prisma

This project uses **Prisma 7** as the ORM.

**Important**: Prisma 7 uses a separate config file (`prisma.config.ts`) for the database URL instead of the schema file.

### Migrations

```bash
# Create a new migration
pnpm --filter api db:migrate

# Apply migrations
pnpm --filter api db:migrate

# Reset database (⚠️ deletes all data)
pnpm --filter api prisma migrate reset
```

### Seeding

```bash
# Seed the database
pnpm db:seed
```

The seed script creates:

- Sample products and categories
- Variants with size/color combinations
- Admin user (credentials in `.env.example`)
- Sample fundraiser campaign
- Sample design objects

### Prisma Studio

View and edit data visually:

```bash
pnpm --filter api prisma studio
```

Opens Prisma Studio at http://localhost:5555

## 🏃 Running the Apps

### Development Mode

Start all apps:

```bash
pnpm dev
```

Start individual apps:

```bash
# API only
pnpm --filter api dev

# Web only
pnpm --filter web dev

# Customer app only
pnpm --filter app dev

# Admin only
pnpm --filter admin dev
```

### Production Build

```bash
# Build all apps
pnpm build

# Build specific app
pnpm --filter api build
```

### Access Points

Once running, access the apps at:

- **API**: http://localhost:3001
  - **Swagger Docs**: http://localhost:3001/docs
  - **Health Check**: http://localhost:3001/v1/health
- **Web (Marketing)**: http://localhost:3000
- **Customer Dashboard**: http://localhost:3002
- **Admin Dashboard**: http://localhost:3003

## 🧪 Testing

### Unit Tests

```bash
# Run all unit tests
pnpm test

# Run tests for specific app
pnpm --filter api test

# Watch mode
pnpm --filter api test:watch
```

### Integration Tests

```bash
pnpm test:integration
```

### Coverage

```bash
pnpm test:coverage
```

Coverage reports are generated in each app's `coverage/` directory.

## 🔍 Code Quality

### Linting

```bash
# Lint all packages
pnpm lint

# Auto-fix linting issues
pnpm --filter api lint
```

### Type Checking

```bash
pnpm typecheck
```

### Formatting

```bash
# Format all files
pnpm format

# Check formatting (CI)
pnpm format:check
```

### Pre-commit Hooks

This project uses **Husky** and **lint-staged** to run linting and formatting before commits.

The pre-commit hook automatically:

- Runs ESLint on staged `.ts`, `.tsx`, `.js`, `.jsx` files
- Formats staged files with Prettier

## 📚 Documentation

Detailed documentation is available in the `docs/` directory:

- **[Architecture](./docs/01-architecture.md)** - System architecture and design decisions
- **[Repo Structure](./docs/02-repo-structure.md)** - Monorepo layout and conventions
- **[Backend Guide](./docs/03-backend.md)** - NestJS modules, APIs, workflows
- **[Frontend Guide](./docs/04-frontend.md)** - Next.js apps and UI conventions
- **[Development Setup](./docs/11-development-setup.md)** - Detailed setup instructions
- **[Testing Strategy](./docs/12-testing-strategy.md)** - Testing approach and coverage
- **[Package State](./docs/00-package-state.md)** - Current package versions and state

For AI implementation guidance, see [docs/README.md](./docs/README.md).

## 🛠️ Tech Stack

### Frontend

- **Next.js 16** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling
- **React 19** - UI library

### Backend

- **NestJS 11** - Node.js framework
- **Prisma 7** - ORM and database toolkit
- **PostgreSQL** - Primary database
- **JWT** - Authentication
- **Swagger/OpenAPI** - API documentation

### Tools

- **pnpm** - Package manager
- **Turborepo** - Monorepo build system
- **ESLint** - Linting
- **Prettier** - Code formatting
- **Husky** - Git hooks
- **Jest** - Testing framework

### Services

- **Docker Compose** - Local service orchestration
- **Redis** - Caching and job queues (optional)
- **OpenTelemetry** - Observability (optional)

## 🚢 Development Workflow

1. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write code following the project conventions
   - Add tests for new functionality
   - Update documentation as needed

3. **Run quality checks**

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

4. **Commit your changes**

   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

   Pre-commit hooks will automatically run linting and formatting.

5. **Push and create a PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## 📦 Package Management

### Adding Dependencies

**Always use pnpm CLI** - never manually edit `package.json`:

```bash
# Add to root (dev dependencies)
pnpm add -D -w <package>

# Add to specific app/package
pnpm --filter api add <package>
pnpm --filter web add <package>
pnpm --filter @tamiym/types add <package>
```

### Workspace Dependencies

Reference shared packages using workspace protocol:

```json
{
  "dependencies": {
    "@tamiym/types": "workspace:*",
    "@tamiym/ui": "workspace:*"
  }
}
```

## 🐛 Troubleshooting

### Port Already in Use

If a port is already in use, you can change it:

- **API**: Set `PORT` in `apps/api/.env.local`
- **Next.js apps**: Modify the port in `package.json` scripts or use `--port` flag

### Database Connection Issues

1. Ensure Docker services are running:

   ```bash
   docker-compose ps
   ```

2. Check `DATABASE_URL` in `apps/api/.env.local`

3. Test connection:
   ```bash
   pnpm --filter api prisma db pull
   ```

### Module Resolution Issues

If you see module resolution errors:

1. Clear node_modules and reinstall:

   ```bash
   rm -rf node_modules apps/*/node_modules packages/*/node_modules
   pnpm install
   ```

2. Clear Turborepo cache:
   ```bash
   pnpm turbo clean
   ```

### Prisma Client Not Generated

```bash
pnpm --filter api prisma generate
```

## 🤝 Contributing

1. Follow the coding standards defined in the docs
2. Write tests for new features
3. Update documentation as needed
4. Ensure all checks pass before submitting PRs
5. Use conventional commit messages

## 📄 License

[Add your license here]

## 🔗 Links

- **API Documentation**: http://localhost:3001/docs (when running)
- **Project Requirements**: See `docs/project_requirements/`
- **Figma Designs**: See `assets/figma_screenshots/`

---

For detailed implementation guidance, see [docs/README.md](./docs/README.md).
