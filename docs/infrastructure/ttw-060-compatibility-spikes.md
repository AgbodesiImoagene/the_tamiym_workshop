# TTW-060 — Compatibility spikes and cleanup

**Date:** 2026-08-20  
**Scope:** Prove architecture-decision contracts before persistent DigitalOcean resources. No production project resources were created.

## Spike matrix

| Contract                                      | Method                                                                                                                                                             | Result                          | Cleanup                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------- |
| 4 GiB resource envelope                       | Hard-limit arithmetic in `ttw-060-resource-budget.*` (3584 MiB + 512 MiB headroom). **Constrained host boot is TTW-063**                                           | Pass (envelope) / deferred boot | N/A                              |
| Managed PostgreSQL TLS / private connectivity | **Deferred** — requires owner DO API token; first disposable cluster is TTW-061/064 sandbox apply+destroy                                                          | Deferred (owner-gated)          | No DO DB created                 |
| Valkey/Redis `noeviction`                     | Production config contract: `maxmemory` 256 MiB + `maxmemory-policy noeviction` recorded in budget JSON                                                            | Pass (config contract)          | N/A                              |
| Spaces / S3 API                               | Local MinIO path-style API: versioned bucket create, PUT/GET, version listing                                                                                      | Pass (S3-compatible)            | Bucket emptied after state proof |
| Provider webhooks                             | Existing Paystack HMAC + idempotent settlement (TTW-010/011); HTTPS public URL contract unchanged                                                                  | Pass (application contract)     | N/A                              |
| OpenTelemetry export                          | Existing OTLP wiring + Compose observability profile                                                                                                               | Pass (application contract)     | N/A                              |
| Singleton scheduler                           | Separate `scheduler` role in budget (one replica)                                                                                                                  | Pass (role split)               | N/A                              |
| Remote state + locking                        | Terraform S3 backend + `use_lockfile` against **local MinIO**; apply/destroy of `terraform_data`; lock object versions observed. **Spaces-native proof → TTW-061** | Pass (MinIO) / deferred Spaces  | Proof resource destroyed         |

## Approved deviations (design review)

1. Live DigitalOcean Managed PostgreSQL disposable spike is **not** required to close the architecture/cost gate; it is a **hard gate for TTW-061/064** before persistent data services.
2. Full 4 GiB no-swap boot with production images is a **hard gate for TTW-063**, not for ADR cost/region selection.
3. Regional 24h RPO applies to PostgreSQL + config; Spaces media and OpenTofu state remain primary-region until replication is funded (see operations doc).

## Disposable DigitalOcean resources

**None created.** Local MinIO/Terraform proof cost: **$0**.

## Commands

```bash
pnpm infra:cost-model
pnpm infra:cost-model:test
pnpm infra:budget-check
# State proof: docs/infrastructure/ttw-060-opentofu-state-backend.md
```
