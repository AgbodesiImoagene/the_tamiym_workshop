terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.49"
    }
  }
}

# Cloud Firewall for the public edge Droplet(s).
# Invariants (enforced here + infra/policy/assert-network-invariants.sh):
# - Public ingress only for SSH (restricted CIDRs), HTTP, HTTPS, and ICMP.
# - Never publish PostgreSQL/Redis/Mongo/Docker/MinIO ports.
# - SSH must never be open to 0.0.0.0/0 or ::/0.
# - Outbound allows HTTPS/DNS/HTTP (ACME/mirrors), NTP, and private DB ports inside the VPC.

resource "digitalocean_firewall" "this" {
  name        = var.name
  droplet_ids = var.droplet_ids
  # DO firewall "tags" select Droplets that share these tags (max 5).
  # Pass labeling.tag_list so TTW-063 Droplets inherit the same membership.
  tags = var.tags

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = var.ssh_source_cidrs
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "icmp"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS to public internet (updates, Paystack API, ACME, observability exporters).
  outbound_rule {
    protocol              = "tcp"
    port_range            = "443"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTP for ACME HTTP-01 and occasional package mirrors.
  outbound_rule {
    protocol              = "tcp"
    port_range            = "80"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "53"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "53"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  # NTP for TLS/ACME validity and coherent logs.
  outbound_rule {
    protocol              = "udp"
    port_range            = "123"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  # Private Managed PostgreSQL only (DO uses 25060; 5432 kept for local-compat paths).
  # Valkey is on-host/loopback and does not need VPC egress.
  outbound_rule {
    protocol              = "tcp"
    port_range            = "25060"
    destination_addresses = [var.vpc_ip_range]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "5432"
    destination_addresses = [var.vpc_ip_range]
  }
}
