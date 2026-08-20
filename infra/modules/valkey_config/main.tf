# Host-local Valkey contract for TTW-063 runtime (not a DigitalOcean managed resource).
# Canonical config: infra/runtime/valkey/valkey.conf
# Compose sketch:   infra/runtime/valkey/compose.snippet.yml

locals {
  maxmemory        = "256mb"
  maxmemory_policy = "noeviction"
  # Password must come from VALKEY_PASSWORD / REDIS_PASSWORD at runtime — never commit.
  requirepass_env         = "VALKEY_PASSWORD"
  conf_path               = "${path.module}/../../runtime/valkey/valkey.conf"
  compose_snippet         = "${path.module}/../../runtime/valkey/compose.snippet.yml"
  managed_upgrade_trigger = <<-EOT
    Promote to DigitalOcean Managed Valkey when any of:
    - sustained Valkey RSS > ~200 MiB or queue backlog/latency SLOs are missed;
    - host restart / single-Droplet loss recovery time is unacceptable;
    - monthly revenue/traffic funds isolation of queue memory from the app Droplet.
  EOT
}

resource "terraform_data" "contract" {
  input = {
    maxmemory        = local.maxmemory
    maxmemory_policy = local.maxmemory_policy
    requirepass_env  = local.requirepass_env
    conf_path        = local.conf_path
    compose_snippet  = local.compose_snippet
  }
}
