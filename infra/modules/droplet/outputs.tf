output "id" {
  description = "Droplet ID."
  value       = digitalocean_droplet.this.id
}

output "name" {
  description = "Droplet name."
  value       = digitalocean_droplet.this.name
}

output "urn" {
  description = "Droplet URN for project attachment."
  value       = digitalocean_droplet.this.urn
}

output "ipv4_address" {
  description = "Droplet public IPv4 (may differ from reserved IP until assignment propagates)."
  value       = digitalocean_droplet.this.ipv4_address
}

output "ipv4_address_private" {
  description = "Droplet private IPv4 in the VPC."
  value       = digitalocean_droplet.this.ipv4_address_private
}
