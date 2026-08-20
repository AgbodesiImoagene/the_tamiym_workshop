variable "name" {
  description = "Cloud Firewall name."
  type        = string
}

variable "tags" {
  description = "DigitalOcean tags that select Droplets this firewall applies to (max 5). Prefer labeling.tag_list."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.tags) <= 5
    error_message = "DigitalOcean firewalls accept at most 5 tags."
  }
}

variable "droplet_ids" {
  description = "Optional explicit Droplet IDs (in addition to tag selection)."
  type        = list(number)
  default     = []
}

variable "ssh_source_cidrs" {
  description = "CIDRs allowed to reach TCP/22. Must be non-empty and must not include the public internet."
  type        = list(string)

  validation {
    condition = (
      length(var.ssh_source_cidrs) > 0 &&
      !contains(var.ssh_source_cidrs, "0.0.0.0/0") &&
      !contains(var.ssh_source_cidrs, "::/0")
    )
    error_message = "ssh_source_cidrs must be non-empty and must not include 0.0.0.0/0 or ::/0."
  }
}

variable "vpc_ip_range" {
  description = "VPC CIDR used for private outbound allow (Managed DB / Valkey)."
  type        = string
}
