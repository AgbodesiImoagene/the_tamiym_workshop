variable "name_prefix" {
  description = "Globally unique prefix for bucket names (e.g. ttw-prod)."
  type        = string
}

variable "region" {
  description = "Spaces region (ams3 near London primary)."
  type        = string
  default     = "ams3"
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
