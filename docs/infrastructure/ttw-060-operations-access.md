# TTW-060 — Backup retention, access, and operating ownership

## Recovery objectives (approved for launch)

| Failure class                          | Data class                    | RPO                                                            | RTO      | Mechanism                                                                                                                             |
| -------------------------------------- | ----------------------------- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Recoverable DB failure (same region)   | PostgreSQL                    | 15 minutes                                                     | 4 hours  | Managed PostgreSQL PITR (7-day window included)                                                                                       |
| Recoverable host failure (same region) | App containers / Valkey       | N/A (reconstructable)                                          | 4 hours  | Redeploy immutable images; rebuild Valkey; reconcile queues from PostgreSQL without replaying money effects                           |
| Regional loss (London unavailable)     | PostgreSQL + config           | 24 hours                                                       | 24 hours | Rebuild in Frankfurt from OpenTofu + restore off-provider DB/config export + DNS cutover                                              |
| Regional loss (London unavailable)     | Spaces media / OpenTofu state | **Best-effort; may exceed 24h until cross-region copy exists** | 24h+     | Primary-region Spaces only at launch; owner accepts media/state regional risk or funds off-provider/object replication in a follow-up |

Owner-approved relaxation: media and OpenTofu state are **not** covered by the 24h regional RPO until an off-provider or cross-region object copy is funded. PostgreSQL remains the authoritative business system of record for money and inventory.

## Backup retention

| Data                                            | Retention                                       | Location                                         |
| ----------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Managed PostgreSQL automatic backups + PITR     | 7 days (provider included)                      | DigitalOcean primary region                      |
| Encrypted logical DB export                     | ≥30 days rolling                                | Off-provider object store (not only the Droplet) |
| OpenTofu state                                  | Versioned indefinitely with prune policy        | Spaces state bucket (primary region at launch)   |
| Application configuration / secret metadata map | Current + previous                              | Owner secret store (not git)                     |
| Spaces media                                    | Provider durability; cross-region copy deferred | Spaces primary                                   |

Droplet weekly backups (20% surcharge) are **not** in the mandatory baseline; rebuild from images + external state is preferred to preserve ceiling headroom.

## Access and ownership

| Role                                   | Owner                                    | Notes                                                  |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| GitHub production environment approver | Product/engineering owner                | Required for apply/deploy                              |
| DigitalOcean account + billing alerts  | Same owner                               | Alert at **USD 45** (below USD 50 ceiling)             |
| SSH to Droplet                         | Key-only; owner-held break-glass key     | No password auth; TTW-065 hardens                      |
| Runtime secrets                        | Protected GitHub env + host secret files | Never in images or git                                 |
| Escalation contact                     | Owner                                    | Personal contact details stay in protected config only |

## Patch / reboot

- Unattended security updates for the Droplet OS with a controlled weekly reboot window.
- Application containers roll via immutable image replace; Valkey restart is reconstructable from PostgreSQL-backed workflows.
- Database maintenance follows DigitalOcean managed windows; app must tolerate brief disconnects with retry.

## Token / SSH procedures (summary)

1. DigitalOcean API token: stored only in GitHub production secrets; rotation and least-privilege practice owned by TTW-065 (DO scoping is coarse).
2. SSH: disable password auth; allowlist Cloud Firewall to admin CIDRs where practical.
3. Break-glass: second SSH key in offline owner storage; audit every use.

Detailed runbooks ship with TTW-065/TTW-067; TTW-060 locks the ownership and retention decisions required before provisioning.
