#!/usr/bin/env bash
# TTW-067 — Isolated restore checklist (does NOT mutate production).
#
# Fails loudly if required evidence/env placeholders are missing.
# Prints ordered steps for a temporary-validation or fra1 restore drill.
#
# Usage:
#   ./restore-isolated-check.sh
#   RESTORE_TARGET=temporary-validation \
#     RESTORE_EVIDENCE_DIR=./evidence/ttw-067-drill \
#     RESTORE_CONFIRM_TARGET=ttw-tmpval-restore-YYYYMMDD \
#     ./restore-isolated-check.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
POLICY="${ROOT}/infra/runtime/backup/policy.json"
QUERIES="${ROOT}/infra/runtime/backup/invariants/post-restore-queries.sql"
FAILED=0

log() { printf '[restore-isolated-check] %s\n' "$*"; }
err() { printf '[restore-isolated-check] ERROR: %s\n' "$*" >&2; FAILED=1; }

log "credential-free checklist — will not apply tofu, change DNS, or touch prod"

# --- required artefacts in repo ---
[[ -f "$POLICY" ]] || err "missing policy.json at ${POLICY}"
[[ -f "$QUERIES" ]] || err "missing post-restore queries at ${QUERIES}"

for rb in \
  droplet-loss.md \
  postgres-restore.md \
  region-loss.md \
  valkey-loss.md \
  failback.md
do
  [[ -f "${ROOT}/infra/runtime/backup/runbooks/${rb}" ]] || err "missing runbook ${rb}"
done

# --- env / evidence expectations for a real drill ---
TARGET="${RESTORE_TARGET:-}"
EVIDENCE_DIR="${RESTORE_EVIDENCE_DIR:-}"
CONFIRM="${RESTORE_CONFIRM_TARGET:-}"

if [[ -z "$TARGET" ]]; then
  err "RESTORE_TARGET unset (expected: temporary-validation | fra1)"
elif [[ "$TARGET" != "temporary-validation" && "$TARGET" != "fra1" ]]; then
  err "RESTORE_TARGET must be temporary-validation or fra1 (got: ${TARGET})"
fi

if [[ -z "$EVIDENCE_DIR" ]]; then
  err "RESTORE_EVIDENCE_DIR unset (directory for recovery-point evidence files)"
elif [[ ! -d "$EVIDENCE_DIR" ]]; then
  err "RESTORE_EVIDENCE_DIR does not exist: ${EVIDENCE_DIR}"
else
  # Expect at least one evidence marker from a prior capture (owner-provided).
  if ! compgen -G "${EVIDENCE_DIR}/*" >/dev/null; then
    err "RESTORE_EVIDENCE_DIR is empty — capture PG/object checksums before restore"
  fi
fi

if [[ -z "$CONFIRM" ]]; then
  err "RESTORE_CONFIRM_TARGET unset — destructive restore requires human confirmation token"
elif [[ "$CONFIRM" == *prod* || "$CONFIRM" == *production* ]]; then
  err "RESTORE_CONFIRM_TARGET looks like production — refuse (isolated targets only in this script)"
fi

# Explicitly refuse production mutation flags if someone sets them.
if [[ "${ALLOW_PROD_RESTORE:-}" == "1" ]]; then
  err "ALLOW_PROD_RESTORE=1 is not honored by this script (isolated drills only)"
fi

log ""
log "=== printed steps (operator executes manually with secrets) ==="
log "1. Confirm authorization: owner approval + RESTORE_CONFIRM_TARGET=${CONFIRM:-<missing>}"
log "2. Provision/select isolated target (${TARGET:-<missing>}); never overwrite prod first"
log "3. Restore Managed PG PITR or offsite logical dump into isolated cluster"
log "4. Restore Spaces versions / inventory-validated objects into recovery bucket/prefix"
log "5. Boot API against isolated DB/Valkey; run SELECT-only ${QUERIES}"
log "6. Compare counts/checksums to evidence in ${EVIDENCE_DIR:-<missing>}"
log "7. Valkey empty + PG-led reconcile/requeue (no duplicate payments)"
log "8. Application read/write smoke; record achieved RPO/RTO"
log "9. DNS cutover only after dual confirmation (see region-loss.md) — NOT this script"
log "10. Failback per failback.md when primary healthy"
log ""

if [[ "$FAILED" -ne 0 ]]; then
  log "FAILED — fix missing env/evidence before claiming a restore drill"
  exit 1
fi

log "OK — checklist preconditions satisfied (still no production mutation performed)"
exit 0
