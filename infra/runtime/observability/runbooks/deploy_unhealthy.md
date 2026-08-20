# Runbook: deploy_unhealthy

**Alert:** `deploy_unhealthy` · **Severity:** page · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

Post-deploy readiness failures, crash loops, elevated 5xx after a revision change.

## Immediate actions

1. Identify failing revision (image digest / `service.version`).
2. Check Compose health for `proxy`, `api`, `web`, `app`, `admin`, `worker`, `scheduler`.
3. Roll back to last known-good digests (owner deploy procedure); do not “fix” migrations forward under incident pressure.
4. Confirm migrate profile was not accidentally applied mid-incident.
5. Capture redacted logs (no secrets/tokens) for follow-up.

## Escalation

Data migration suspicion → stop deploys; TTW-067 / owner DB decision.

## Related

- TTW-063 images/Compose; TTW-068 release workflow.
