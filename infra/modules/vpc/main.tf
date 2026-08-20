terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.49"
    }
  }
}

resource "digitalocean_vpc" "this" {
  name        = var.name
  region      = var.region
  ip_range    = var.ip_range
  description = var.description
}
