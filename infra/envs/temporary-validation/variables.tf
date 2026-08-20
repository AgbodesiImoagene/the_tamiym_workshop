variable "project" {
  description = "Stable project identifier used in tags."
  type        = string
  default     = "tamiym-workshop"
}

variable "environment_label" {
  description = "Tag value for env (temporary-validation)."
  type        = string
  default     = "temporary-validation"
}

variable "managed_by" {
  description = "Automation identity tag."
  type        = string
  default     = "opentofu"
}

variable "ticket" {
  description = "Owning ticket for this composition."
  type        = string
  default     = "TTW-061"
}

variable "do_project_name" {
  description = "DigitalOcean project name."
  type        = string
  default     = "ttw-tmpval"
}

variable "do_project_description" {
  description = "DigitalOcean project description."
  type        = string
  default     = "Tamiym Workshop temporary validation (TTW-061 foundation)."
}

variable "do_project_purpose" {
  description = "DigitalOcean project purpose."
  type        = string
  default     = "Web Application"
}

variable "do_project_environment" {
  description = "DigitalOcean project environment enum."
  type        = string
  default     = "Development"
}

variable "region" {
  description = "Default DigitalOcean region (ADR London primary)."
  type        = string
  default     = "lon1"
}
