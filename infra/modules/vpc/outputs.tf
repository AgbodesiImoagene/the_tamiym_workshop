output "id" {
  description = "VPC id."
  value       = digitalocean_vpc.this.id
}

output "urn" {
  description = "VPC URN for project membership."
  value       = digitalocean_vpc.this.urn
}

output "uuid" {
  description = "VPC UUID (preferred membership / attachment id)."
  value       = digitalocean_vpc.this.id
}

output "ip_range" {
  description = "Configured VPC CIDR."
  value       = digitalocean_vpc.this.ip_range
}

output "region" {
  description = "VPC region."
  value       = digitalocean_vpc.this.region
}
