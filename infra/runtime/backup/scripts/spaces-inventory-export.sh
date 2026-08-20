#!/usr/bin/env bash
# TTW-067 — Spaces / S3-compatible object inventory (metadata) export sketch.
# Lists or syncs object keys/metadata; does not bake credentials.
#
# Usage:
#   DRY_RUN=1 ./spaces-inventory-export.sh
#   SPACES_ENDPOINT=… SPACES_BUCKET=… OFFSITE_DEST=… ./spaces-inventory-export.sh
#
# Placeholders assume an AWS CLI–compatible client configured via env/profile.
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
EVIDENCE_DIR="${BACKUP_EVIDENCE:-}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
INVENTORY_NAME="ttw-spaces-inventory-${STAMP}.jsonl"

log() { printf '[spaces-inventory-export] %s\n' "$*"; }
die() { printf '[spaces-inventory-export] ERROR: %s\n' "$*" >&2; exit 1; }

# Optional prefix filter (e.g. quarantine/). Empty = whole bucket.
PREFIX="${SPACES_PREFIX:-}"

if [[ -z "${SPACES_BUCKET:-}" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN: SPACES_BUCKET unset (would fail in live mode)"
  else
    die "SPACES_BUCKET is required"
  fi
fi

if [[ -z "${SPACES_ENDPOINT:-}" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN: SPACES_ENDPOINT unset (e.g. https://ams3.digitaloceanspaces.com)"
  else
    die "SPACES_ENDPOINT is required (S3-compatible endpoint URL)"
  fi
fi

if [[ -z "${OFFSITE_DEST:-}" ]]; then
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN: OFFSITE_DEST unset (would fail in live mode)"
  else
    die "OFFSITE_DEST is required for inventory artefact landing"
  fi
fi

log "stamp=${STAMP} inventory=${INVENTORY_NAME} bucket=${SPACES_BUCKET:-<unset>} prefix=${PREFIX:-<all>}"

# AWS CLI placeholders — credentials via AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
# or AWS_PROFILE pointing at Spaces keys (owner secret store). Never commit keys.
LIST_CMD=(
  aws --endpoint-url "${SPACES_ENDPOINT:-https://SPACES_ENDPOINT_PLACEHOLDER}"
  s3api list-objects-v2
  --bucket "${SPACES_BUCKET:-BUCKET_PLACEHOLDER}"
)
if [[ -n "$PREFIX" ]]; then
  LIST_CMD+=(--prefix "$PREFIX")
fi

if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY_RUN: would run: ${LIST_CMD[*]}"
  log "DRY_RUN: would write key/size/etag/last-modified lines to ${INVENTORY_NAME}"
  log "DRY_RUN: would upload inventory to \$OFFSITE_DEST/${INVENTORY_NAME}"
  log "DRY_RUN: version restore path = s3api list-object-versions + restore/copy prior VersionId"
  exit 0
fi

command -v aws >/dev/null 2>&1 || die "aws CLI not found (S3-compatible placeholder)"

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

OUT="${TMP_DIR}/${INVENTORY_NAME}"
log "listing object metadata…"
# Paginated listing left as owner hardening; this sketch captures one page shape.
"${LIST_CMD[@]}" --output json \
  | python3 -c '
import json,sys
data=json.load(sys.stdin)
for obj in data.get("Contents") or []:
    print(json.dumps({
        "key": obj.get("Key"),
        "size": obj.get("Size"),
        "etag": obj.get("ETag"),
        "last_modified": obj.get("LastModified"),
        "storage_class": obj.get("StorageClass"),
    }))
' >"$OUT"

BYTES="$(wc -c <"$OUT" | tr -d ' ')"
LINES="$(wc -l <"$OUT" | tr -d ' ')"
log "inventory lines=${LINES} bytes=${BYTES}"
log "NEXT (owner): upload ${OUT} to ${OFFSITE_DEST%/}/${INVENTORY_NAME}"
log "Version restore: aws s3api list-object-versions --bucket … --prefix KEY then copy VersionId"

if [[ -n "$EVIDENCE_DIR" ]]; then
  mkdir -p "$EVIDENCE_DIR"
  EVIDENCE_FILE="${EVIDENCE_DIR}/spaces-inventory-${STAMP}.json"
  cat >"$EVIDENCE_FILE" <<EOF
{
  "kind": "spaces_inventory_export",
  "ticket": "TTW-067",
  "artifact": "${INVENTORY_NAME}",
  "utc": "${STAMP}",
  "bytes": ${BYTES},
  "object_rows": ${LINES},
  "bucket": "${SPACES_BUCKET}"
}
EOF
  log "wrote evidence ${EVIDENCE_FILE}"
fi

log "inventory sketch complete"
