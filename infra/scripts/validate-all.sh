#!/usr/bin/env bash
# Credential-free OpenTofu validation for TTW-061/062/064.
# Requires OpenTofu on PATH (CI installs 1.9.1; local: $HOME/.local/bin/tofu).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA="${ROOT}/infra"
export PATH="${HOME}/.local/bin:${PATH}"

if ! command -v tofu >/dev/null 2>&1; then
  echo "error: tofu not found on PATH" >&2
  exit 1
fi

echo "==> tofu version"
tofu version

echo "==> deny-secrets"
bash "${INFRA}/policy/deny-secrets.sh"

echo "==> assert-network-invariants"
bash "${INFRA}/policy/assert-network-invariants.sh"

echo "==> assert-data-invariants"
bash "${INFRA}/policy/assert-data-invariants.sh"

echo "==> tofu fmt -check -recursive"
(cd "$INFRA" && tofu fmt -check -recursive)

validate_root() {
  local dir="$1"
  echo "==> validate: ${dir}"
  (
    cd "${INFRA}/${dir}"
    tofu init -backend=false -input=false -lockfile=readonly
    tofu validate
  )
}

# Module roots that declare providers.
validate_root "modules/digitalocean_project"
validate_root "modules/vpc"
validate_root "modules/firewall"
validate_root "modules/reserved_ip"
validate_root "modules/postgres"
validate_root "modules/spaces"
validate_root "modules/spaces_protected"

# Environment compositions.
validate_root "envs/production"
validate_root "envs/temporary-validation"

# Labeling + valkey_config have no DO provider resources; loaded via envs above
# (valkey ships runtime conf under infra/runtime/valkey/).

echo "==> all infra validations passed"
