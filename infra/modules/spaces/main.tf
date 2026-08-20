terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.49"
    }
  }
}

# Three-bucket media layout (TTW-064):
# - originals: private design/source assets (never public-read)
# - quarantine: private scan/hold area (never public-read)
# - derived: public-read delivery for approved derived/public objects + CORS
#
# Prefer separate buckets over a single multi-prefix bucket so ACLs cannot
# accidentally make originals/quarantine world-readable.

resource "digitalocean_spaces_bucket" "originals" {
  name          = "${var.name_prefix}-originals"
  region        = var.region
  acl           = "private"
  force_destroy = var.force_destroy

  versioning {
    enabled = var.enable_versioning
  }
}

resource "digitalocean_spaces_bucket" "quarantine" {
  name          = "${var.name_prefix}-quarantine"
  region        = var.region
  acl           = "private"
  force_destroy = var.force_destroy

  versioning {
    enabled = var.enable_versioning
  }
}

resource "digitalocean_spaces_bucket" "derived" {
  name          = "${var.name_prefix}-derived"
  region        = var.region
  acl           = "public-read"
  force_destroy = var.force_destroy

  versioning {
    enabled = var.enable_versioning
  }

  dynamic "cors_rule" {
    for_each = length(var.cors_allowed_origins) > 0 ? [1] : []
    content {
      allowed_headers = ["*"]
      allowed_methods = ["GET", "HEAD"]
      allowed_origins = var.cors_allowed_origins
      max_age_seconds = 3600
    }
  }
}
