terraform {
  required_version = ">= 1.6.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.49"
    }
  }
}

locals {
  public_hostnames = {
    web   = var.web_hostname
    app   = var.app_hostname
    admin = var.admin_hostname
    api   = var.api_hostname
  }

  # Intended cookie / CORS contract strings for app configuration (TTW-063+).
  customer_cookie_domain = var.customer_cookie_domain
  admin_cookie_domain    = var.admin_cookie_domain
  cors_allowed_origins = join(",", [
    "https://${var.web_hostname}",
    "https://${var.app_hostname}",
    "https://${var.admin_hostname}",
  ])
  paystack_webhook_url = "https://${var.api_hostname}/v1/webhooks/paystack"
}

module "labeling" {
  source = "../../modules/labeling"

  project     = var.project
  environment = var.environment_label
  managed_by  = var.managed_by
  ticket      = var.ticket
}

module "project" {
  source = "../../modules/digitalocean_project"

  name        = var.do_project_name
  description = var.do_project_description
  purpose     = var.do_project_purpose
  environment = var.do_project_environment
  is_default  = false
}

module "vpc" {
  source = "../../modules/vpc"

  name        = var.vpc_name
  region      = var.region
  ip_range    = var.vpc_ip_range
  description = var.vpc_description
}

module "firewall" {
  source = "../../modules/firewall"

  name             = var.firewall_name
  tags             = module.labeling.tag_list
  droplet_ids      = []
  ssh_source_cidrs = var.ssh_source_cidrs
  vpc_ip_range     = var.vpc_ip_range
}

module "reserved_ip" {
  source = "../../modules/reserved_ip"

  region = var.region
}
