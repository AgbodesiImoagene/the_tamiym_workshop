#!/usr/bin/env bash
# Assert identity/secrets invariants for TTW-065 (credential-free).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/infra/policy/assert-security-invariants.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "assert-security-invariants: node is required" >&2
  exit 1
fi

node "$SCRIPT" "$ROOT"
