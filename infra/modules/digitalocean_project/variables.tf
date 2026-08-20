variable "name" {
  description = "DigitalOcean project name (unique within the account)."
  type        = string
}

variable "description" {
  description = "Human-readable project description."
  type        = string
  default     = ""
}

variable "purpose" {
  description = "DigitalOcean project purpose string."
  type        = string
  default     = "Web Application"
}

variable "environment" {
  description = "DigitalOcean project environment (Development | Staging | Production)."
  type        = string
}

variable "is_default" {
  description = "Whether this project is the account default."
  type        = bool
  default     = false
}

variable "resource_urns" {
  description = "Optional DigitalOcean resource URNs to assign to this project later."
  type        = list(string)
  default     = []
}
