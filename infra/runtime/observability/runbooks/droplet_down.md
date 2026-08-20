# Runbook: droplet_down

**Alert:** `droplet_down` · **Severity:** page · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

DigitalOcean reports Droplet offline / agent lost; public HTTPS fails; SSH may fail.

## Immediate actions

1. Check DO control panel power/status and recent events (no token in chat logs).
2. If powered off unexpectedly → power on once; watch boot + Compose health.
3. If kernel panic / stuck → console access; capture redacted evidence; reboot once.
4. If host is unrecoverable → declare incident; follow TTW-067 recovery path (restore to replacement Droplet / reserved IP reassignment).

## Escalation

Regional outage or repeated unexplained downs → owner + provider support; do not recreate resources without plan review.

## Related

- TTW-062 reserved IP / firewall; TTW-063 Compose boot order.
