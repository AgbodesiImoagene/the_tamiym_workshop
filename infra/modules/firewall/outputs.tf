output "id" {
  description = "Cloud Firewall id."
  value       = digitalocean_firewall.this.id
}

output "name" {
  description = "Cloud Firewall name."
  value       = digitalocean_firewall.this.name
}

output "status" {
  description = "Firewall provisioning status."
  value       = digitalocean_firewall.this.status
}
