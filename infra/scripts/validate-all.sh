#!/usr/bin/env bash
# Credential-free OpenTofu validation for TTW-061.
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

# Module roots that declare providers (digitalocean_project).
validate_root "modules/digitalocean_project"

# Environment compositions.
validate_root "envs/production"
validate_root "envs/temporary-validation"

# Labeling module has no providers; still fmt-clean and syntactically loadable
# via a disposable init when called from envs above.

echo "==> all infra validations passed"
