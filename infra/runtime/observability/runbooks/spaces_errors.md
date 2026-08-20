# Runbook: spaces_errors

**Alert:** `spaces_errors` · **Severity:** ticket · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

Elevated S3-compatible 4xx/5xx; upload/download failures for originals/quarantine/derived.

## Immediate actions

1. Distinguish auth (403), missing bucket (404), and provider 5xx.
2. Confirm app uses app Spaces keys — not state-backend keys (TTW-065).
3. Verify bucket ACLs unchanged (originals/quarantine private).
4. Retry idempotent uploads; quarantine poison objects.
5. Do not flip originals/quarantine to public-read.

## Escalation

Provider outage or mass 403 after rotation → owner key ceremony.

## Related

- TTW-064 Spaces modules; TTW-021 media ingestion.
