variable "name_prefix" {
  description = "Globally unique prefix for bucket names (e.g. ttw-tmpval)."
  type        = string
}

variable "region" {
  description = <<-EOT
    Spaces region. Spaces is not available in lon1; use an EU Spaces region
    (ams3 recommended near London primary, or fra1 for recovery alignment).
  EOT
  type        = string
  default     = "ams3"
}

variable "force_destroy" {
  description = "Allow destroy of non-empty buckets (true for temporary-validation)."
  type        = bool
  default     = false
}

variable "cors_allowed_origins" {
  description = "HTTPS origins allowed for derived/public object browser access."
  type        = list(string)
  default     = []
}

variable "enable_versioning" {
  description = "Enable object versioning on all three buckets."
  type        = bool
  default     = true
}
