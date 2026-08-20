variable "name" {
  description = "Managed PostgreSQL cluster name (unique per account/region)."
  type        = string
}

variable "region" {
  description = "DigitalOcean region (ADR London primary)."
  type        = string
  default     = "lon1"
}

variable "size" {
  description = "Database droplet size slug."
  type        = string
  default     = "db-s-1vcpu-1gb"
}

variable "engine_version" {
  description = "PostgreSQL major version (matches local Compose postgres:16)."
  type        = string
  default     = "16"
}

variable "node_count" {
  description = "Cluster node count (single-node at launch)."
  type        = number
  default     = 1
}

variable "vpc_uuid" {
  description = "VPC UUID for private_network_uuid attachment."
  type        = string
}

variable "project_id" {
  description = "Optional DigitalOcean project id for the cluster."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags applied to the database cluster."
  type        = list(string)
  default     = []
}

variable "deletion_protection" {
  description = <<-EOT
    When true, OpenTofu lifecycle.prevent_destroy is enabled (production).
    The DigitalOcean provider has no deletion_protection attribute; this is the
    IaC-equivalent gate. temporary-validation must set false for destroy-friendly cleanup.
  EOT
  type        = bool
}

variable "firewall_rules" {
  description = <<-EOT
    Trusted sources for digitalocean_database_firewall. Allowed types: tag, ip_addr,
    droplet, k8s, app. Must never include 0.0.0.0/0 or ::/0 (enforced by policy).
    Prefer Droplet tags and/or VPC CIDR (ip_addr).
  EOT
  type = list(object({
    type  = string
    value = string
  }))

  validation {
    condition = alltrue([
      for r in var.firewall_rules :
      !contains(["0.0.0.0/0", "::/0"], r.value)
    ])
    error_message = "database firewall_rules must not allow 0.0.0.0/0 or ::/0."
  }

  validation {
    condition = alltrue([
      for r in var.firewall_rules :
      contains(["tag", "ip_addr", "droplet", "k8s", "app"], r.type)
    ])
    error_message = "firewall_rules.type must be one of: tag, ip_addr, droplet, k8s, app."
  }

  validation {
    condition     = length(var.firewall_rules) > 0
    error_message = "At least one database firewall rule is required."
  }
}

variable "maintenance_day" {
  description = "Weekly maintenance window day (lowercase)."
  type        = string
  default     = "sunday"
}

variable "maintenance_hour" {
  description = "Maintenance window start hour (UTC, HH:MM:SS)."
  type        = string
  default     = "04:00:00"
}
