terraform {
  required_version = ">= 1.6.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.49"
    }
  }
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
