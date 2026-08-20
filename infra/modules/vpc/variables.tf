variable "name" {
  description = "VPC name (unique per account/region)."
  type        = string
}

variable "region" {
  description = "DigitalOcean region (ADR London primary)."
  type        = string
  default     = "lon1"
}

variable "ip_range" {
  description = "Private IPv4 CIDR for the VPC (RFC1918)."
  type        = string
}

variable "description" {
  description = "Human-readable VPC description."
  type        = string
  default     = ""
}
