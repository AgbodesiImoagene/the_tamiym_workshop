terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.49"
    }
  }
}

# Reserved (floating) IPv4 for stable DNS A records. Assignment to a Droplet
# is deferred to TTW-063; create unassigned so Namecheap can target the IP early.

resource "digitalocean_reserved_ip" "this" {
  region = var.region
}
