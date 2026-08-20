terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.49"
    }
  }
}

# DigitalOcean engine slug is "pg" (not "postgres").
# deletion_protection: provider has no attribute; use lifecycle.prevent_destroy via
# twin resources so production cannot destroy and tmpval can.

locals {
  common = {
    name                 = var.name
    engine               = "pg"
    version              = var.engine_version
    size                 = var.size
    region               = var.region
    node_count           = var.node_count
    private_network_uuid = var.vpc_uuid
    tags                 = var.tags
    project_id           = var.project_id
  }
}

resource "digitalocean_database_cluster" "protected" {
  count = var.deletion_protection ? 1 : 0

  name                 = local.common.name
  engine               = local.common.engine
  version              = local.common.version
  size                 = local.common.size
  region               = local.common.region
  node_count           = local.common.node_count
  private_network_uuid = local.common.private_network_uuid
  tags                 = local.common.tags
  project_id           = local.common.project_id

  maintenance_window {
    day  = var.maintenance_day
    hour = var.maintenance_hour
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "digitalocean_database_cluster" "ephemeral" {
  count = var.deletion_protection ? 0 : 1

  name                 = local.common.name
  engine               = local.common.engine
  version              = local.common.version
  size                 = local.common.size
  region               = local.common.region
  node_count           = local.common.node_count
  private_network_uuid = local.common.private_network_uuid
  tags                 = local.common.tags
  project_id           = local.common.project_id

  maintenance_window {
    day  = var.maintenance_day
    hour = var.maintenance_hour
  }
}

locals {
  cluster_id   = var.deletion_protection ? digitalocean_database_cluster.protected[0].id : digitalocean_database_cluster.ephemeral[0].id
  cluster_urn  = var.deletion_protection ? digitalocean_database_cluster.protected[0].urn : digitalocean_database_cluster.ephemeral[0].urn
  cluster_host = var.deletion_protection ? digitalocean_database_cluster.protected[0].private_host : digitalocean_database_cluster.ephemeral[0].private_host
  cluster_port = var.deletion_protection ? digitalocean_database_cluster.protected[0].port : digitalocean_database_cluster.ephemeral[0].port
  cluster_db   = var.deletion_protection ? digitalocean_database_cluster.protected[0].database : digitalocean_database_cluster.ephemeral[0].database
  cluster_user = var.deletion_protection ? digitalocean_database_cluster.protected[0].user : digitalocean_database_cluster.ephemeral[0].user
}

resource "digitalocean_database_firewall" "this" {
  cluster_id = local.cluster_id

  dynamic "rule" {
    for_each = var.firewall_rules
    content {
      type  = rule.value.type
      value = rule.value.value
    }
  }
}
