# Runbook: security_finding

**Alert:** `security_finding` · **Severity:** page · **Owner role:** `OWNER_PLACEHOLDER_SECURITY`

## Symptoms

High/critical infra finding, suspected public exposure, break-glass SSH use, or credential anomaly.

## Immediate actions

1. Classify: exposure vs malware vs credential vs policy drift.
2. Contain: tighten firewall, revoke token/SSH key, rotate affected secrets (TTW-065).
3. Preserve redacted evidence; never paste live tokens into tickets/chat.
4. Close break-glass with mandatory rotation and audit note.
5. Schedule follow-up review before re-opening normal change window.

## Escalation

Confirmed compromise → owner incident commander; consider TTW-067 recovery.

## Related

- `docs/infrastructure/ttw-065-identity-secrets.md`
