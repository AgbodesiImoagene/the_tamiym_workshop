terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.49"
    }
  }
}

resource "digitalocean_project" "this" {
  name        = var.name
  description = var.description
  purpose     = var.purpose
  environment = var.environment
  is_default  = var.is_default

  # Membership is optional; later tickets assign Droplets/DBs via resource_urns.
  resources = var.resource_urns
}

# DigitalOcean projects do not accept arbitrary tags on the project resource itself
# in all API versions; expose tags as outputs for resource-level tagging and
# documentation. Callers should pass labeling.tag_list into dependent resources.
