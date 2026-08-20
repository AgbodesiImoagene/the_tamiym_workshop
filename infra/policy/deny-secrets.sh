#!/usr/bin/env bash
# Deny committed DigitalOcean API token patterns and other obvious secrets under infra/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA="${ROOT}/infra"
FAILED=0

# dop_v1_… is the common DO personal access token prefix.
# Also catch accidental export DIGITALOCEAN_TOKEN= literal assignments with long values.
PATTERNS=(
  'dop_v1_[A-Za-z0-9_]{20,}'
  'DIGITALOCEAN_TOKEN[[:space:]]*=[[:space:]]*["'\'']?[A-Za-z0-9_]{20,}'
  'access_key[[:space:]]*=[[:space:]]*["'\'']?(DO|AKIA)[A-Z0-9]{16,}'
  'secret_key[[:space:]]*=[[:space:]]*["'\'']?[A-Za-z0-9/+]{30,}'
)

# Only scan tracked-style source under infra; skip .terraform and example placeholders
# that intentionally contain CHANGE_ME.
while IFS= read -r -d '' file; do
  # Skip binary-ish and generated dirs
  case "$file" in
    */.terraform/*|*/.terraform) continue ;;
    *.tfstate|*.tfstate.*|*.tfplan) continue ;;
  esac

  for pat in "${PATTERNS[@]}"; do
    if grep -nE "$pat" "$file" 2>/dev/null | grep -vE 'CHANGE_ME|example|placeholder|never commit' >/dev/null; then
      echo "deny-secrets: potential secret in $file (pattern: $pat)" >&2
      grep -nE "$pat" "$file" | grep -vE 'CHANGE_ME|example|placeholder|never commit' >&2 || true
      FAILED=1
    fi
  done
done < <(find "$INFRA" -type f \( -name '*.tf' -o -name '*.hcl' -o -name '*.tfvars' -o -name '*.sh' -o -name '*.md' -o -name '*.example' \) -print0)

if [[ "$FAILED" -ne 0 ]]; then
  echo "deny-secrets: FAILED" >&2
  exit 1
fi

echo "deny-secrets: OK"
