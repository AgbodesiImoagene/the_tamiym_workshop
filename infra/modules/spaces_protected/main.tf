terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.49"
    }
  }
}

# Production Spaces buckets — OpenTofu prevent_destroy is a literal (cannot be
# a variable). temporary-validation uses ../spaces without this lifecycle.

resource "digitalocean_spaces_bucket" "originals" {
  name          = "${var.name_prefix}-originals"
  region        = var.region
  acl           = "private"
  force_destroy = false

  versioning {
    enabled = var.enable_versioning
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "digitalocean_spaces_bucket" "quarantine" {
  name          = "${var.name_prefix}-quarantine"
  region        = var.region
  acl           = "private"
  force_destroy = false

  versioning {
    enabled = var.enable_versioning
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "digitalocean_spaces_bucket" "derived" {
  name          = "${var.name_prefix}-derived"
  region        = var.region
  acl           = "public-read"
  force_destroy = false

  versioning {
    enabled = var.enable_versioning
  }

  lifecycle {
    prevent_destroy = true
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
