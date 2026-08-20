output "ip_address" {
  description = "Reserved public IPv4 address."
  value       = digitalocean_reserved_ip.this.ip_address
}

output "urn" {
  description = "Reserved IP URN for project membership."
  value       = digitalocean_reserved_ip.this.urn
}

output "region" {
  description = "Region of the reserved IP."
  value       = digitalocean_reserved_ip.this.region
}
