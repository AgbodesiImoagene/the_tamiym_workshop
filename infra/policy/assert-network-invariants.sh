#!/usr/bin/env bash
# Assert network invariants for TTW-062 Cloud Firewall HCL (credential-free).
# Delegates parsing to a small Node script so port ranges and inbound blocks
# are checked structurally rather than with brittle single-line greps.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="${ROOT}/infra/policy/assert-network-invariants.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "assert-network-invariants: node is required" >&2
  exit 1
fi

node "$SCRIPT" "$ROOT"
