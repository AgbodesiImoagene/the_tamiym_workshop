output "tags" {
  description = "Standard resource tags for DigitalOcean and other providers."
  value       = local.tags
}

output "tag_list" {
  description = "Flat key:value list suitable for DigitalOcean project tags."
  value       = [for k, v in local.tags : "${k}:${v}"]
}
