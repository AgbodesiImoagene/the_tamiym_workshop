output "id" {
  description = "Managed PostgreSQL cluster id."
  value       = local.cluster_id
}

output "urn" {
  description = "Cluster URN for project membership."
  value       = local.cluster_urn
}

output "private_host" {
  description = "Private VPC hostname (prefer over public host)."
  value       = local.cluster_host
}

output "port" {
  description = "PostgreSQL listen port (typically 25060 on DO)."
  value       = local.cluster_port
}

output "database" {
  description = "Default database name."
  value       = local.cluster_db
}

output "user" {
  description = "Default admin username (rotate app roles in TTW-065)."
  value       = local.cluster_user
  sensitive   = true
}

output "engine" {
  description = "Engine slug (always pg)."
  value       = "pg"
}

output "size" {
  description = "Cluster size slug."
  value       = var.size
}

output "region" {
  description = "Cluster region."
  value       = var.region
}

output "deletion_protection" {
  description = "Whether OpenTofu prevent_destroy is active for this cluster."
  value       = var.deletion_protection
}

output "firewall_id" {
  description = "Database firewall id."
  value       = digitalocean_database_firewall.this.id
}
