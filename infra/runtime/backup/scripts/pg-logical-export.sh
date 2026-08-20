#!/usr/bin/env bash
# TTW-067 — Encrypted off-provider PostgreSQL logical export sketch.
# Credential-free: no secrets baked in. Owner injects DATABASE_URL / OFFSITE_DEST.
#
# Usage:
#   DRY_RUN=1 ./pg-logical-export.sh
#   DATABASE_URL=… OFFSITE_DEST=s3://… ./pg-logical-export.sh
#
# Does not mutate production schema. Does not delete backups.
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
EVIDENCE_DIR="${BACKUP_EVIDENCE:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARTIFACT_NAME="ttw-pg-logical-${STAMP}.dump"

log() { printf '[pg-logical-export] %s\n' "$*"; }
die() { printf '[pg-logical-export] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN: DATABASE_URL unset (would fail in live mode)"
  else
    die "DATABASE_URL is required (inject from owner secret store; never commit)"
  fi
fi

if [[ -z "${OFFSITE_DEST:-}" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN: OFFSITE_DEST unset (would fail in live mode)"
  else
    die "OFFSITE_DEST is required (off-provider URI/path; never commit credentials)"
  fi
fi

log "stamp=${STAMP} artifact=${ARTIFACT_NAME}"
log "plan: pg_dump -> encrypt -> upload to OFFSITE_DEST"

if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY_RUN: would run: pg_dump --format=custom --no-owner --file=${ARTIFACT_NAME} \"\$DATABASE_URL\""
  log "DRY_RUN: would encrypt artefact with owner tooling (age/gpg/SSE — not hardcoded here)"
  log "DRY_RUN: would upload encrypted blob to \$OFFSITE_DEST/${ARTIFACT_NAME}.enc"
  log "DRY_RUN: would write evidence (id, utc, bytes, checksum) without credentials"
  exit 0
fi

command -v pg_dump >/dev/null 2>&1 || die "pg_dump not found on PATH"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

DUMP_PATH="${TMP_DIR}/${ARTIFACT_NAME}"
log "running pg_dump (custom format)…"
# shellcheck disable=SC2086
pg_dump --format=custom --no-owner --file="${DUMP_PATH}" "${DATABASE_URL}"

BYTES="$(wc -c <"${DUMP_PATH}" | tr -d ' ')"
if command -v sha256sum >/dev/null 2>&1; then
  CHECKSUM="$(sha256sum "${DUMP_PATH}" | awk '{print $1}')"
else
  CHECKSUM="unavailable"
fi

log "dump bytes=${BYTES} sha256=${CHECKSUM}"
log "NEXT (owner): encrypt ${DUMP_PATH} then upload to ${OFFSITE_DEST%/}/${ARTIFACT_NAME}.enc"
log "Upload CLI is environment-specific (aws s3 cp / rclone / etc.) — credentials via env/IAM only."

if [[ -n "$EVIDENCE_DIR" ]]; then
  mkdir -p "$EVIDENCE_DIR"
  EVIDENCE_FILE="${EVIDENCE_DIR}/pg-logical-${STAMP}.json"
  cat >"$EVIDENCE_FILE" <<EOF
{
  "kind": "pg_logical_export",
  "ticket": "TTW-067",
  "artifact": "${ARTIFACT_NAME}",
  "utc": "${STAMP}",
  "bytes": ${BYTES},
  "sha256": "${CHECKSUM}",
  "offsite_dest_basename": "${OFFSITE_DEST##*/}"
}
EOF
  log "wrote evidence ${EVIDENCE_FILE}"
fi

log "export sketch complete (upload/encrypt left to owner automation)"
