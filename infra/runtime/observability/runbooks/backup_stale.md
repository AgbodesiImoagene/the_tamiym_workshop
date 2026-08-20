# Runbook: backup_stale

**Alert:** `backup_stale` · **Severity:** page · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

Managed PostgreSQL backup / PITR window older than approved RPO; missing recent backup marker.

## Immediate actions

1. Confirm DO Managed Database backup schedule and last successful backup timestamp.
2. Check for failed backup jobs or cluster in degraded state.
3. Do not delete the cluster or disable backups to “clear” the alert.
4. If backups blocked by quota/provider error → open provider ticket; document gap start time.
5. Schedule a verified restore drill when healthy (TTW-067) — not during an active outage unless recovery requires it.

## Escalation

RPO already breached → owner + declare backup gap incident; plan compensatory snapshot if available.

## Related

- TTW-067 disaster recovery; TTW-064 Managed PG.
