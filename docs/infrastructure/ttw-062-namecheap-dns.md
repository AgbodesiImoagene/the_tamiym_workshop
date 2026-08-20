# TTW-062 — Namecheap DNS (outside OpenTofu)

Namecheap remains the registrar and initial authoritative DNS provider
([ADR-001](../19-digitalocean-production-architecture-decision.md)). There is no
approved Namecheap OpenTofu provider in this repository, so DNS is documented and
applied manually (or via Namecheap’s control panel / API by the owner) after the
reserved IP is provisioned.

**Related OpenTofu outputs:** `reserved_ip`, `public_hostnames`,
`paystack_webhook_url` from `infra/envs/production` and
`infra/envs/temporary-validation`.

## Ownership and recovery

| Item                      | Value                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registrar                 | Namecheap (owner account; 2FA required)                                                                                                                 |
| Apex (production)         | `tamiym.com`                                                                                                                                            |
| Temporary-validation zone | `tmpval.tamiym.com` (NS or records under the apex)                                                                                                      |
| Change control            | Document who/when in the apply ticket; prefer TTL ≥ 300s during cutover                                                                                 |
| Recovery                  | Keep registrar login + recovery codes off-provider; snapshot current records before edits; roll back A/CNAME to previous reserved IP or last known good |

Do **not** transfer the domain as part of TTW-062. Do **not** commit Namecheap API tokens.

## Production records (`tamiym.com`)

Point every public surface at the production reserved IP (OpenTofu output
`reserved_ip`). Replace `<RESERVED_IP>` after apply.

| Host                | Type  | Value           | Notes                                                               |
| ------------------- | ----- | --------------- | ------------------------------------------------------------------- |
| `@` (apex)          | A     | `<RESERVED_IP>` | Optional; prefer redirect apex → `www` at the edge                  |
| `www`               | A     | `<RESERVED_IP>` | Public marketing (`web`)                                            |
| `app`               | A     | `<RESERVED_IP>` | Customer app                                                        |
| `admin`             | A     | `<RESERVED_IP>` | Admin app                                                           |
| `api`               | A     | `<RESERVED_IP>` | NestJS API (`/v1`, webhooks)                                        |
| `www`               | CNAME | —               | Prefer A records to reserved IP; avoid CNAME at the same label as A |
| `_acme-challenge.*` | TXT   | (ACME)          | Only if using DNS-01; HTTP-01 needs no TXT when port 80 is open     |

Recommended canonical layout (matches OpenTofu hostname defaults):

- `www.tamiym.com` → A → `<RESERVED_IP>`
- `app.tamiym.com` → A → `<RESERVED_IP>`
- `admin.tamiym.com` → A → `<RESERVED_IP>`
- `api.tamiym.com` → A → `<RESERVED_IP>`
- Apex `tamiym.com` → A → `<RESERVED_IP>` **or** URL redirect to `https://www.tamiym.com`

Optional TXT (owner policy):

| Host                     | Type | Value               | Purpose                              |
| ------------------------ | ---- | ------------------- | ------------------------------------ |
| `@`                      | TXT  | `v=spf1 …`          | Mail SPF (when mail is enabled)      |
| `_dmarc`                 | TXT  | `v=DMARC1; …`       | DMARC                                |
| `@` or provider-specific | TXT  | domain verification | Paystack / Google / etc. as required |

## Temporary-validation records (`tmpval.tamiym.com`)

Use the temporary-validation reserved IP (separate from production).

| Host                      | Type | Value                  |
| ------------------------- | ---- | ---------------------- |
| `www.tmpval.tamiym.com`   | A    | `<TMPVAL_RESERVED_IP>` |
| `app.tmpval.tamiym.com`   | A    | `<TMPVAL_RESERVED_IP>` |
| `admin.tmpval.tamiym.com` | A    | `<TMPVAL_RESERVED_IP>` |
| `api.tmpval.tamiym.com`   | A    | `<TMPVAL_RESERVED_IP>` |

Cookie/CORS contracts for this zone use `.tmpval.tamiym.com` (see env outputs).

## Paystack webhook DNS dependency

Paystack must reach:

`https://api.<zone>/v1/webhooks/paystack`

Production default: `https://api.tamiym.com/v1/webhooks/paystack`  
Temporary-validation default: `https://api.tmpval.tamiym.com/v1/webhooks/paystack`

DNS for `api` must resolve before webhook registration. Application-layer HMAC
verification remains mandatory (never open the path without signature checks).

## ACME / TLS notes (DNS side)

- Prefer **HTTP-01** via Caddy on the Droplet (ports 80/443 public). No special TXT records required.
- If HTTP-01 is blocked, use DNS-01 TXT under `_acme-challenge.<hostname>` and document the challenge values in the renewal runbook (TTW-063/065).
- Lower TTL (300s) during first issuance and reserved-IP cutover; raise afterward.

## Change procedure (owner)

1. Apply OpenTofu env; capture `reserved_ip` and `public_hostnames`.
2. Create/update Namecheap A records as above.
3. Wait for propagation (`dig +short www.tamiym.com`).
4. Issue/renew certificates on the edge (TTW-063 Caddy).
5. Register Paystack webhook URL; send a test event.
6. Record the change (operator, time, previous records) for recovery.
