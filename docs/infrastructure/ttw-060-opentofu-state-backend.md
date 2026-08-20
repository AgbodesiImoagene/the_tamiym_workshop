# TTW-060 — OpenTofu remote-state backend selection and proof

**Decision:** Use an **S3-compatible backend** (DigitalOcean Spaces in production; MinIO for local proof) with **object versioning** and **native lock files** (`use_lockfile = true`). Do **not** assume Spaces implements every AWS DynamoDB-style lock semantic; prefer Terraform/OpenTofu native S3 lock objects, verified against the chosen endpoint before TTW-061 bootstrap.

## Why Spaces + native lockfile

- Portable with OpenTofu/Terraform `backend "s3"`.
- Versioning supports state recovery without committing state to git.
- Lock objects (`.tflock`) provide concurrency control without a second lock service.
- Credentials stay in the owner-protected GitHub environment / operator secret store (TTW-065), never in git.

## Production layout (TTW-061)

| Env                  | State key prefix    | DO project tag |
| -------------------- | ------------------- | -------------- |
| production           | `prod/opentofu/…`   | `ttw-prod`     |
| temporary-validation | `tmpval/opentofu/…` | `ttw-tmpval`   |

Separate Spaces buckets **or** separate prefixes with distinct credentials are required so a command cannot target both environments implicitly.

## Local proof (2026-08-20)

1. Started standalone MinIO on `127.0.0.1:19000` (not Docker; socket ACL blocked Compose).
2. Created versioned bucket `ttw-tofu-state`.
3. Initialized Terraform `1.14.1` with `backend "s3"` + `use_lockfile = true` against MinIO path-style endpoint.
4. `terraform apply` created `terraform_data.proof`; state object version recorded.
5. Lock file versions `proof.tfstate.tflock` appeared during applies.
6. `terraform destroy` removed the proof resource.
7. No DigitalOcean Spaces bucket or API token was used.

This proves the **S3-compatible backend + native lockfile mechanism** on MinIO. It does **not** by itself prove Spaces locking semantics, concurrent-apply failure modes on Spaces, or production recovery. Those remain TTW-061 bootstrap acceptance criteria.

Evidence artefacts stay out of git (`.terraform/`, `*.tfstate*`, `backend.hcl`). Committed files:

- `infra/bootstrap/state-backend-proof/main.tf`
- `infra/bootstrap/state-backend-proof/backend.hcl.example`
- `infra/bootstrap/state-backend-proof/README.md`

## Recovery drill (operator)

1. List object versions for the state key.
2. Restore the last known-good state version to current.
3. Re-init and `terraform plan` to confirm no unexpected destroy.
4. Rotate compromised backend credentials immediately.

## Follow-up for TTW-061

- Pin OpenTofu in CI (OpenTofu preferred over Terraform for project standard; HCL remains compatible).
- Bootstrap a dedicated **state** Spaces bucket in the primary region with versioning + restricted keys before any application module apply.
- Prove concurrent apply lock failure with an intentional long-running apply once DO credentials exist.
