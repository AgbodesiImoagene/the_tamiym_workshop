# Architecture

## High-level topology

- **Frontend:** Next.js (TypeScript) in a monorepo
- **Backend:** NestJS (TypeScript) + Prisma
- **Database:** PostgreSQL
- **Cache/Queue (optional but recommended):** Redis
- **Object storage:** S3-compatible bucket (design uploads/assets)
- **Payments & payouts:** Paystack (Nigeria-only v1)
- **Observability:** OpenTelemetry (traces + metrics) + structured logs (JSON)

## Subdomains (as requested)

- `www.<domain>` — public marketing pages (Next.js app)
- `app.<domain>` — customer dashboard + design workshop (Next.js app)
- `admin.<domain>` — admin dashboard (Next.js app)
  All three apps share UI packages and types from the monorepo.

## Why modular monolith

The PRD scope is broad but tightly coupled (designs → orders → fundraising → admin). A modular monolith ships faster and stays maintainable.

## Core domains (backend modules)

- Auth & users
- Products & inventory
- Designs (workshop)
- Orders & checkout
- Fundraising
- Admin operations
- Analytics/reporting
- Notifications

## Data flow overview

1. Customer browses products → selects variant → opens Design Workshop.
2. Design Workshop saves a **structured design model** (not just an image).
3. Checkout creates an order + payment intent (Paystack).
4. Paystack webhooks confirm payment → order transitions.
5. Admin updates order status; triggers notifications & analytics updates.
6. Fundraising campaigns use the same product + design primitives; campaign pages are shareable and public.

## Critical implementation principle (from PRD risks)

**Preview is an approximation; production constraints must be respected.**
Design placement is constrained to printable areas. Store designs as a layer model for edit/duplicate/moderation and future print pipelines.
