# State backend proof (TTW-060)

Harmless `terraform_data` resource used to prove S3-compatible remote state,
versioning, and native lock files against a local MinIO endpoint.

## Run

1. Start MinIO (or point `backend.hcl` at a disposable Spaces bucket).
2. `cp backend.hcl.example backend.hcl` and set endpoint/credentials locally.
3. `terraform init -reconfigure -backend-config=backend.hcl`
4. `terraform apply -auto-approve`
5. `terraform destroy -auto-approve`

Never commit `backend.hcl`, `.terraform/`, or `*.tfstate*`.
