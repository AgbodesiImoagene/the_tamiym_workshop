# Runbook: cost_warning

**Alert:** `cost_warning` · **Severity:** ticket (escalate before overrun) · **Owner role:** `OWNER_PLACEHOLDER_COST`

## Symptoms

Projected DigitalOcean monthly spend approaching the **USD 50** warning threshold (catalog `cost.warning_usd_lte: 50`).

## Immediate actions

1. Split spend by project/tag: `ttw-prod` vs `ttw-tmpval` vs recovery.
2. Tear down leftover temporary-validation resources (TTW-068).
3. Check unexpected Droplet size, extra volumes, Spaces growth, Managed DB tier changes, OTLP overage.
4. Freeze non-essential apply/scale; escalate to owner **before** projected overrun.
5. Record baseline vs anomaly in the monthly cost note (owner vault / ops log — no secrets).

## Escalation

Hard escalation path fires before envelope overrun; do not silence billing alerts.

## Related

- TTW-060 cost model (`pnpm infra:cost-model`); `docs/infrastructure/ttw-066-observability-cost.md`.
