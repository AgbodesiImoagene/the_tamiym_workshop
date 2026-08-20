terraform {
  required_version = ">= 1.6.0"

  # Credentials and endpoint are supplied via -backend-config=backend.hcl
  # (never commit real keys). See backend.hcl.example.
  backend "s3" {
    bucket                      = "ttw-tofu-state"
    key                         = "bootstrap/proof.tfstate"
    region                      = "us-east-1"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    use_path_style              = true
    use_lockfile                = true
  }
}

resource "terraform_data" "proof" {
  input = "ttw-060-state-backend-proof"
}

output "proof_marker" {
  value = terraform_data.proof.output
}
