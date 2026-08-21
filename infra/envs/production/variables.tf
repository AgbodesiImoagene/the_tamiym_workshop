variable "project" {
  description = "Stable project identifier used in tags."
  type        = string
  default     = "tamiym-workshop"
}

variable "environment_label" {
  description = "Tag value for env (production)."
  type        = string
  default     = "production"
}

variable "managed_by" {
  description = "Automation identity tag."
  type        = string
  default     = "opentofu"
}

variable "ticket" {
  description = "Owning ticket for this composition."
  type        = string
  default     = "TTW-063"
}

variable "do_project_name" {
  description = "DigitalOcean project name."
  type        = string
  default     = "ttw-prod"
}

variable "do_project_description" {
  description = "DigitalOcean project description."
  type        = string
  default     = "Tamiym Workshop production (TTW-062 network + TTW-064 data)."
}

variable "do_project_purpose" {
  description = "DigitalOcean project purpose."
  type        = string
  default     = "Web Application"
}

variable "do_project_environment" {
  description = "DigitalOcean project environment enum."
  type        = string
  default     = "Production"
}

variable "region" {
  description = "Default DigitalOcean region (ADR London primary)."
  type        = string
  default     = "lon1"
}

variable "vpc_name" {
  description = "Production VPC name."
  type        = string
  default     = "ttw-prod-vpc"
}

variable "vpc_ip_range" {
  description = "Production VPC CIDR."
  type        = string
  default     = "10.10.0.0/16"
}

variable "vpc_description" {
  description = "Production VPC description."
  type        = string
  default     = "Tamiym Workshop production VPC (lon1)."
}

variable "firewall_name" {
  description = "Production Cloud Firewall name."
  type        = string
  default     = "ttw-prod-edge"
}

variable "ssh_source_cidrs" {
  description = "CIDRs allowed for SSH. Replace before apply with operator admin IPs. Must never include 0.0.0.0/0."
  type        = list(string)
  # Loopback placeholder keeps credential-free validate green; owner must override for real SSH.
  default = ["127.0.0.1/32"]
}

variable "root_domain" {
  description = "Apex domain registered at Namecheap."
  type        = string
  default     = "thetamiymworkshop.com"
}

variable "web_hostname" {
  description = "Public marketing hostname."
  type        = string
  default     = "www.thetamiymworkshop.com"
}

variable "app_hostname" {
  description = "Customer app hostname."
  type        = string
  default     = "app.thetamiymworkshop.com"
}

variable "admin_hostname" {
  description = "Admin app hostname."
  type        = string
  default     = "admin.thetamiymworkshop.com"
}

variable "api_hostname" {
  description = "API hostname."
  type        = string
  default     = "api.thetamiymworkshop.com"
}

variable "customer_cookie_domain" {
  description = "Parent-domain cookie scope for shared customer session (web + app)."
  type        = string
  default     = ".thetamiymworkshop.com"
}

variable "admin_cookie_domain" {
  description = "Isolated admin cookie host (no parent-domain sharing with customers)."
  type        = string
  default     = "admin.thetamiymworkshop.com"
}

variable "postgres_name" {
  description = "Managed PostgreSQL cluster name."
  type        = string
  default     = "ttw-prod-pg"
}

variable "postgres_size" {
  description = "Managed PostgreSQL size slug."
  type        = string
  default     = "db-s-1vcpu-1gb"
}

variable "postgres_version" {
  description = "PostgreSQL major version."
  type        = string
  default     = "16"
}

variable "postgres_maintenance_day" {
  description = "Weekly maintenance day (UTC)."
  type        = string
  default     = "sunday"
}

variable "postgres_maintenance_hour" {
  description = "Maintenance window start hour (UTC)."
  type        = string
  default     = "04:00:00"
}

variable "spaces_name_prefix" {
  description = "Globally unique Spaces bucket name prefix."
  type        = string
  default     = "ttw-prod"
}

variable "spaces_region" {
  description = "Spaces region (Spaces unavailable in lon1; ams3 is EU-near London)."
  type        = string
  default     = "ams3"
}

variable "enable_app_droplet" {
  description = "When true, create the application Droplet and assign the reserved IP (owner-gated apply)."
  type        = bool
  default     = false
}

variable "droplet_name" {
  description = "Application Droplet name."
  type        = string
  default     = "ttw-prod-app"
}

variable "droplet_size" {
  description = "Application Droplet size (4 GiB launch envelope)."
  type        = string
  default     = "s-2vcpu-4gb"
}

variable "droplet_image" {
  description = "Droplet image slug."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "droplet_ssh_key_fingerprints" {
  description = "DigitalOcean SSH key fingerprints for Droplet access. Required when enable_app_droplet is true."
  type        = list(string)
  default     = []

  validation {
    condition     = !var.enable_app_droplet || length(var.droplet_ssh_key_fingerprints) > 0
    error_message = "droplet_ssh_key_fingerprints must be non-empty when enable_app_droplet is true."
  }
}
