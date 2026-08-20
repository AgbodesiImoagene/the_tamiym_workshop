#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "${ROOT}/infra/policy/assert-runtime-invariants.mjs" "${ROOT}"
