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
