output "maxmemory" {
  description = "Hard memory ceiling for host-local Valkey."
  value       = local.maxmemory
}

output "maxmemory_policy" {
  description = "Eviction policy (must remain noeviction for BullMQ/idempotency)."
  value       = local.maxmemory_policy
}

output "requirepass_env" {
  description = "Environment variable name that supplies requirepass at runtime."
  value       = local.requirepass_env
}

output "conf_path" {
  description = "Path to shipped valkey.conf relative to this module."
  value       = local.conf_path
}

output "compose_snippet_path" {
  description = "Path to Compose snippet for TTW-063."
  value       = local.compose_snippet
}

output "managed_upgrade_trigger" {
  description = "When to replace host-local Valkey with managed Valkey."
  value       = trimspace(local.managed_upgrade_trigger)
}

output "contract" {
  description = "Stable contract map for downstream docs/CI."
  value       = terraform_data.contract.output
}
