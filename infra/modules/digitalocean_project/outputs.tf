output "id" {
  description = "DigitalOcean project id."
  value       = digitalocean_project.this.id
}

output "name" {
  description = "DigitalOcean project name."
  value       = digitalocean_project.this.name
}

output "owner_uuid" {
  description = "DigitalOcean account UUID that owns the project."
  value       = digitalocean_project.this.owner_uuid
}
