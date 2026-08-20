#!/usr/bin/env bash
# Assert release / ephemeral-env invariants for TTW-068 (credential-free).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/infra/policy/assert-release-invariants.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "assert-release-invariants: node is required" >&2
  exit 1
fi

node "$SCRIPT" "$ROOT"
