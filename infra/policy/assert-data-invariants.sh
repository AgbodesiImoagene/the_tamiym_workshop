#!/usr/bin/env bash
# Assert data-service invariants for TTW-064 (credential-free).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/infra/policy/assert-data-invariants.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "assert-data-invariants: node is required" >&2
  exit 1
fi

node "$SCRIPT" "$ROOT"
