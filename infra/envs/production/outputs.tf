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
