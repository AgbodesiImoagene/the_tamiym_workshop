# Remote state — credentials and endpoint via -backend-config only.
# Example: tofu init -backend-config=backend.hcl
# Never commit backend.hcl or real keys.

terraform {
  backend "s3" {
    # bucket / endpoint / credentials supplied by backend.hcl
    key = "tmpval/opentofu/infrastructure.tfstate"

    # Spaces is S3-compatible; skip AWS-specific checks.
    region                      = "us-east-1"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    use_path_style              = true
    use_lockfile                = true
  }
}
