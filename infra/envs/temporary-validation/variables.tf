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
  default     = "TTW-062"
}

variable "do_project_name" {
  description = "DigitalOcean project name."
  type        = string
  default     = "ttw-tmpval"
}

variable "do_project_description" {
  description = "DigitalOcean project description."
  type        = string
  default     = "Tamiym Workshop temporary validation (TTW-062 network/DNS/edge)."
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

variable "vpc_name" {
  description = "Temporary-validation VPC name."
  type        = string
  default     = "ttw-tmpval-vpc"
}

variable "vpc_ip_range" {
  description = "Temporary-validation VPC CIDR (isolated from production)."
  type        = string
  default     = "10.20.0.0/16"
}

variable "vpc_description" {
  description = "Temporary-validation VPC description."
  type        = string
  default     = "Tamiym Workshop temporary-validation VPC (lon1)."
}

variable "firewall_name" {
  description = "Temporary-validation Cloud Firewall name."
  type        = string
  default     = "ttw-tmpval-edge"
}

variable "ssh_source_cidrs" {
  description = "CIDRs allowed for SSH. Replace before apply with operator admin IPs. Must never include 0.0.0.0/0."
  type        = list(string)
  default     = ["127.0.0.1/32"]
}

variable "root_domain" {
  description = "Validation DNS zone under Namecheap (subzone of production apex)."
  type        = string
  default     = "tmpval.tamiym.com"
}

variable "web_hostname" {
  description = "Temporary-validation public marketing hostname."
  type        = string
  default     = "www.tmpval.tamiym.com"
}

variable "app_hostname" {
  description = "Temporary-validation customer app hostname."
  type        = string
  default     = "app.tmpval.tamiym.com"
}

variable "admin_hostname" {
  description = "Temporary-validation admin hostname."
  type        = string
  default     = "admin.tmpval.tamiym.com"
}

variable "api_hostname" {
  description = "Temporary-validation API hostname."
  type        = string
  default     = "api.tmpval.tamiym.com"
}

variable "customer_cookie_domain" {
  description = "Customer cookie scope for temporary-validation hosts."
  type        = string
  default     = ".tmpval.tamiym.com"
}

variable "admin_cookie_domain" {
  description = "Isolated admin cookie host for temporary-validation."
  type        = string
  default     = "admin.tmpval.tamiym.com"
}
