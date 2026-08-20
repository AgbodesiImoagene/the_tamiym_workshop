terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.49"
    }
  }
}

resource "digitalocean_droplet" "this" {
  name      = var.name
  region    = var.region
  size      = var.size
  image     = var.image
  vpc_uuid  = var.vpc_uuid
  ssh_keys  = var.ssh_key_fingerprints
  tags      = var.tags
  user_data = var.user_data

  monitoring = true
  ipv6       = false

  lifecycle {
    ignore_changes = [
      # Cloud-init is applied at create; later host drift is managed outside OpenTofu.
      user_data,
    ]
  }
}

resource "digitalocean_reserved_ip_assignment" "this" {
  count = var.assign_reserved_ip ? 1 : 0

  ip_address = var.reserved_ip
  droplet_id = digitalocean_droplet.this.id
}
