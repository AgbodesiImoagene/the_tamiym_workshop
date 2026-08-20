output "project_id" {
  description = "DigitalOcean project id for ttw-prod."
  value       = module.project.id
}

output "project_name" {
  description = "DigitalOcean project name."
  value       = module.project.name
}

output "tags" {
  description = "Standard labeling tags."
  value       = module.labeling.tags
}

output "region" {
  description = "Default region for subsequent modules."
  value       = var.region
}

output "vpc_uuid" {
  description = "Production VPC UUID."
  value       = module.vpc.uuid
}

output "vpc_ip_range" {
  description = "Production VPC CIDR."
  value       = module.vpc.ip_range
}

output "firewall_id" {
  description = "Production Cloud Firewall id."
  value       = module.firewall.id
}

output "reserved_ip" {
  description = "Reserved public IPv4 for DNS A records (unassigned until TTW-063)."
  value       = module.reserved_ip.ip_address
}

output "public_hostnames" {
  description = "Map of surface → public hostname."
  value       = local.public_hostnames
}

output "customer_cookie_domain" {
  description = "Intended customer session cookie Domain attribute (web + app sharing)."
  value       = local.customer_cookie_domain
}

output "admin_cookie_domain" {
  description = "Intended admin session cookie host (isolated from customers)."
  value       = local.admin_cookie_domain
}

output "cors_allowed_origins" {
  description = "Comma-separated HTTPS origins for API CORS allowlist (web, app, admin)."
  value       = local.cors_allowed_origins
}

output "paystack_webhook_url" {
  description = "Public Paystack webhook URL (edge → api:/v1/webhooks/paystack)."
  value       = local.paystack_webhook_url
}

output "root_domain" {
  description = "Apex domain (Namecheap)."
  value       = var.root_domain
}

output "postgres_id" {
  description = "Managed PostgreSQL cluster id."
  value       = module.postgres.id
}

output "postgres_private_host" {
  description = "Private VPC hostname for PostgreSQL."
  value       = module.postgres.private_host
}

output "postgres_port" {
  description = "PostgreSQL port."
  value       = module.postgres.port
}

output "postgres_deletion_protection" {
  description = "Whether OpenTofu prevent_destroy is enabled for PostgreSQL."
  value       = module.postgres.deletion_protection
}

output "spaces_buckets" {
  description = "Role → Spaces bucket name map."
  value       = module.spaces.bucket_map
}

output "spaces_region" {
  description = "Spaces region."
  value       = module.spaces.region
}

output "spaces_derived_endpoint" {
  description = "Derived/public bucket endpoint."
  value       = module.spaces.derived_endpoint
}

output "valkey_maxmemory" {
  description = "Host-local Valkey maxmemory contract."
  value       = module.valkey_config.maxmemory
}

output "valkey_maxmemory_policy" {
  description = "Host-local Valkey eviction policy (must be noeviction)."
  value       = module.valkey_config.maxmemory_policy
}

output "valkey_conf_path" {
  description = "Shipped Valkey config path for TTW-063 Compose."
  value       = module.valkey_config.conf_path
}
