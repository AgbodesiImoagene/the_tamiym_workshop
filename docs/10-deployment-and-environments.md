# Deployment & Environments

## Environments

- `dev` (local)
- `staging` (optional but recommended)
- `prod`

## Secrets

Use environment variables only.
Never commit secrets.

## Services

- Postgres
- Redis (optional)
- API
- 3 frontend apps (web/app/admin)
- OTel Collector (optional)

## Deployment target (suggested)

Railway for v1 speed.
Keep infra code portable.
