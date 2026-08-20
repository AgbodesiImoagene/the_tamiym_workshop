# Shared OpenTofu / provider version policy for The Tamiym Workshop.
# Environment roots (envs/*) and modules that talk to DigitalOcean must declare
# matching required_providers blocks. Keep pins aligned across roots.

terraform {
  required_version = ">= 1.6.0"
}

# Documented pins (enforced in each env root that uses the provider):
#   digitalocean/digitalocean ~> 2.49
# OpenTofu CLI pin: see .opentofu-version (1.9.1) and CI install steps.
