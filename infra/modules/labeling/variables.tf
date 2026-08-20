variable "project" {
  description = "Stable project identifier (e.g. tamiym-workshop)."
  type        = string
}

variable "environment" {
  description = "Environment name (production | temporary-validation)."
  type        = string
}

variable "managed_by" {
  description = "Automation identity that owns these resources."
  type        = string
  default     = "opentofu"
}

variable "ticket" {
  description = "Owning ticket id (e.g. TTW-061)."
  type        = string
}

variable "extra_tags" {
  description = "Optional additional tags merged into the standard set."
  type        = map(string)
  default     = {}
}
