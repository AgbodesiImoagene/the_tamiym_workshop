# Design Workshop — Fabric.js + Structured Design Model

## Library

- Fabric.js recommended for fastest usable editor.

## Canonical design representation (store in DB)

Designs are stored as a structured model, not pixels.

- Design has views: `front`, `back`, optional `sleeve`
- Each view has `layers[]`:
  - `text` layers (content, font, size, color, transforms)
  - `image` layers (asset ref, transforms)

## Printable bounds

Each product + view defines a printable bounding box.

- The editor constrains layer placement to bounds.
- This addresses the PRD risk: preview ≠ production.

## Local dev fixtures

A designable product requires admin-configured data, not just a `ProductView`:

- `ProductImage` with `WORKSHOP_TEMPLATE` role for the view
- `WorkshopTemplateLayer` records (at least one `BASE` layer image)
- `PrintArea` for the view
- Optional `OptionValueTemplateEffect` (e.g. `TINT`) for colour swatches to change the template

Seed workshop-ready demo data:

```bash
pnpm --filter api seed:workshop-demo
```

Creates `demo.customer@tamiym.local` / `DemoPassword1!` and `demo.admin@tamiym.local` / `DemoPassword1!` plus two ACTIVE products with template layers and print areas. For password-only admin login during local UI testing, set `AUTH_ADMIN_MFA_DISABLED=true` in `apps/api/.env.local` (forbidden in production).

## Save/duplicate/share

- Save stores structured model + references to uploaded assets.
- Duplicate clones the model.
- Share generates a short public token/URL to view the design (read-only).

## Export strategy (v1)

- Generate a preview image for thumbnails (client-side export OK)
- Keep structured model for future server-side print asset generation.
