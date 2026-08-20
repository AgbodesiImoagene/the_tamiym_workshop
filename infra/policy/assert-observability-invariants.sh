#!/usr/bin/env bash
# Assert observability/cost invariants for TTW-066 (credential-free).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/infra/policy/assert-observability-invariants.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "assert-observability-invariants: node is required" >&2
  exit 1
fi

node "$SCRIPT" "$ROOT"
