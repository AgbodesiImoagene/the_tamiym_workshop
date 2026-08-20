variable "name" {
  description = "Droplet name."
  type        = string
}

variable "region" {
  description = "DigitalOcean region (ADR: lon1 primary)."
  type        = string
}

variable "size" {
  description = "Droplet size slug (launch: s-2vcpu-4gb)."
  type        = string
  default     = "s-2vcpu-4gb"
}

variable "image" {
  description = "Droplet image slug or ID."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "vpc_uuid" {
  description = "VPC UUID for private networking."
  type        = string
}

variable "ssh_key_fingerprints" {
  description = "DigitalOcean SSH key fingerprints (or IDs as strings) for initial access."
  type        = list(string)
}

variable "tags" {
  description = "Droplet tags (prefer labeling.tag_list)."
  type        = list(string)
  default     = []
}

variable "user_data" {
  description = "cloud-init user-data (TTW-065 hardening sketch)."
  type        = string
  default     = ""
}

variable "assign_reserved_ip" {
  description = "When true, assign the provided reserved IP to this Droplet."
  type        = bool
  default     = true
}

variable "reserved_ip" {
  description = "Reserved IPv4 address to assign (required when assign_reserved_ip is true)."
  type        = string
  default     = ""

  validation {
    condition     = !var.assign_reserved_ip || length(var.reserved_ip) > 0
    error_message = "reserved_ip must be set when assign_reserved_ip is true."
  }
}
