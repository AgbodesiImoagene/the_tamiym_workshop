output "region" {
  description = "Spaces region for all buckets."
  value       = var.region
}

output "originals_bucket" {
  description = "Private originals bucket name."
  value       = digitalocean_spaces_bucket.originals.name
}

output "originals_urn" {
  description = "Originals bucket URN."
  value       = digitalocean_spaces_bucket.originals.urn
}

output "originals_endpoint" {
  description = "S3-compatible endpoint for originals."
  value       = digitalocean_spaces_bucket.originals.endpoint
}

output "quarantine_bucket" {
  description = "Private quarantine bucket name."
  value       = digitalocean_spaces_bucket.quarantine.name
}

output "quarantine_urn" {
  description = "Quarantine bucket URN."
  value       = digitalocean_spaces_bucket.quarantine.urn
}

output "quarantine_endpoint" {
  description = "S3-compatible endpoint for quarantine."
  value       = digitalocean_spaces_bucket.quarantine.endpoint
}

output "derived_bucket" {
  description = "Public/derived delivery bucket name."
  value       = digitalocean_spaces_bucket.derived.name
}

output "derived_urn" {
  description = "Derived bucket URN."
  value       = digitalocean_spaces_bucket.derived.urn
}

output "derived_endpoint" {
  description = "S3-compatible endpoint for derived."
  value       = digitalocean_spaces_bucket.derived.endpoint
}

output "derived_bucket_domain_name" {
  description = "Public CDN-friendly domain for derived objects."
  value       = digitalocean_spaces_bucket.derived.bucket_domain_name
}

output "bucket_map" {
  description = "Role → bucket name map for application config."
  value = {
    originals  = digitalocean_spaces_bucket.originals.name
    quarantine = digitalocean_spaces_bucket.quarantine.name
    derived    = digitalocean_spaces_bucket.derived.name
  }
}
