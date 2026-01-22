# PRD Traceability (PRD → Implementation)

This file maps PRD requirements to implementation deliverables to avoid drift.

## Public Website

- Home/About/Products/Fundraising pages — apps/web

## Customer Dashboard

- Product browsing, design management, orders, fundraising, settings — apps/app

## Design Workshop

- Upload artwork, add text, view switching, save/share/duplicate — apps/app + api/designs

## Checkout & Orders

- Shipping info, payment method selection (Paystack), success states, order history — apps/app + api/orders + api/payments

## Fundraising

- Campaign creation workflow, shareable pages, performance snapshot — apps/app + apps/web (public pages) + api/fundraising

## Admin Dashboard

- Orders/products/inventory management, fundraising admin, moderation, access control — apps/admin + api/admin

## Basic Analytics

- Simple dashboards + filters + CSV exports — apps/admin + api/analytics

## Non-functional requirements

- Responsive UI, error handling, modern browser support — frontend
- Security separation (admin/customer), avoid storing sensitive payment details — backend
- Observability — api + frontends

## Deadline

Delivery target: end of Feb 2026 (contingent on client cooperation).
