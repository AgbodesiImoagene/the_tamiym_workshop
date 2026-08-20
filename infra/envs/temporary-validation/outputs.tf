output "project_id" {
  description = "DigitalOcean project id for ttw-tmpval."
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
  description = "Temporary-validation VPC UUID."
  value       = module.vpc.uuid
}

output "vpc_ip_range" {
  description = "Temporary-validation VPC CIDR."
  value       = module.vpc.ip_range
}

output "firewall_id" {
  description = "Temporary-validation Cloud Firewall id."
  value       = module.firewall.id
}

output "reserved_ip" {
  description = "Reserved public IPv4 for temporary-validation DNS A records (assigned when enable_app_droplet)."
  value       = module.reserved_ip.ip_address
}

output "droplet_id" {
  description = "Application Droplet ID when enable_app_droplet is true; otherwise null."
  value       = var.enable_app_droplet ? module.droplet[0].id : null
}

output "droplet_private_ip" {
  description = "Droplet private VPC IPv4 when enable_app_droplet is true; otherwise null."
  value       = var.enable_app_droplet ? module.droplet[0].ipv4_address_private : null
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
  description = "Public Paystack webhook URL for temporary-validation."
  value       = local.paystack_webhook_url
}

output "root_domain" {
  description = "Temporary-validation DNS zone (Namecheap)."
  value       = var.root_domain
}

output "postgres_id" {
  description = "Temporary-validation Managed PostgreSQL cluster id."
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
  description = "Must be false for destroy-friendly temporary-validation."
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

output "valkey_maxmemory" {
  description = "Host-local Valkey maxmemory contract."
  value       = module.valkey_config.maxmemory
}

output "valkey_maxmemory_policy" {
  description = "Host-local Valkey eviction policy (must be noeviction)."
  value       = module.valkey_config.maxmemory_policy
}
