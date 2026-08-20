# TTW-067 — Backup and disaster recovery

Credential-free backup policy, export sketches, isolated restore checklist, and
runbooks for The Tamiym Workshop on DigitalOcean. Complements TTW-064 (data),
TTW-065 (secrets), and TTW-066 (`backup_stale` alert). **No live restore,
failover, or DNS cutover in this ticket** — those remain owner-gated when secrets
and approved isolation targets exist.

Launch posture is **single-node backup-and-rebuild**, not warm standby
(ADR-001 / TTW-060).

## Data classes

| Class                      | Authority                                                              | Reconstructable? | Backup mechanism                                                              |
| -------------------------- | ---------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| PostgreSQL                 | **Authoritative** business system of record (money, inventory, orders) | No               | Managed PITR (7d) + encrypted daily off-provider logical export               |
| Spaces objects             | Media originals / quarantine / derived                                 | No (bytes)       | Versioning + inventory/metadata export; cross-region copy **deferred**        |
| OpenTofu state             | Infra identity / bindings                                              | Partially        | Versioned Spaces state backend; off-provider state copy preferred when funded |
| Host secrets / config      | Runtime `/etc/tamiym/secrets.env`, Caddy, Compose env                  | No               | Owner vault (current + previous); never git                                   |
| Valkey (queues / sessions) | Operational only                                                       | **Yes**          | Do **not** treat as durable; rebuild empty + PG-led reconcile / safe requeue  |

## Approved recovery objectives

Matches ADR-001 and `docs/infrastructure/ttw-060-operations-access.md`:

| Failure class                           | RPO             | RTO      | Notes                                                                                                                    |
| --------------------------------------- | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| Recoverable service/data failure (lon1) | **15 min**      | **4 h**  | Managed PG PITR + Droplet rebuild from images; Valkey reconstructable                                                    |
| Primary-region loss (lon1 unavailable)  | **24 h**        | **24 h** | `fra1` rebuild from OpenTofu + off-provider DB/config + Namecheap DNS cutover                                            |
| Spaces / OpenTofu state (regional)      | **Best-effort** | 24h+     | **May exceed 24h** until cross-region or off-provider object replication is funded (owner-approved honesty from TTW-060) |

Owner may approve more relaxed targets only when cost and business exposure are
explicit and recorded on a follow-up ticket.

## Managed PostgreSQL PITR + off-provider export

### Provider PITR

- DigitalOcean Managed PostgreSQL includes **7-day** automatic backups / PITR
  in the primary region (`lon1`).
- Restore target for drills: **isolated** cluster (temporary-validation project
  or recovery-tagged resources) — never overwrite production without explicit
  human authorization (see Authorization).
- Monitor freshness via TTW-066 alert id `backup_stale`.

### Encrypted daily logical export (script contract)

Sketch: `infra/runtime/backup/scripts/pg-logical-export.sh`.

| Env / input       | Meaning                                             |
| ----------------- | --------------------------------------------------- |
| `DATABASE_URL`    | Source connection (owner-injected; never committed) |
| `OFFSITE_DEST`    | Destination URI/path for encrypted artefact         |
| `DRY_RUN=1`       | Print intended actions; do not dump or upload       |
| `BACKUP_EVIDENCE` | Optional path to write timestamp/size evidence file |

Contract (credential-free CI only validates the script exists and is executable):

1. Prefer `pg_dump` (custom or plain format) against a **read-only / backup**
   role when available.
2. Encrypt at rest before/during upload (owner tooling: age/gpg/s3 SSE-C —
   not hardcoded in-repo).
3. Record backup identifier, start/end UTC, byte size, and checksum in evidence
   — **never** record credentials or connection strings.
4. Fail loudly if `DATABASE_URL` or `OFFSITE_DEST` missing (unless `DRY_RUN`).

Backup deletion rights must use a **separate** identity from routine workload
and deployment tokens (TTW-065).

## Spaces export / versioning restore path

- Buckets: originals, quarantine, derived (TTW-064). Versioning enabled.
- Sketch: `infra/runtime/backup/scripts/spaces-inventory-export.sh` lists or
  syncs **object key metadata** via S3-compatible CLI placeholders
  (`aws s3api` / `s3cmd` against Spaces endpoint).
- Restore path:
  1. Prefer version restore in-place for accidental delete/overwrite.
  2. For isolated drills, sync into a recovery-tagged bucket or prefix.
  3. Reconcile DB `media_assets` / `media_derivatives` keys against inventory
     (`infra/runtime/backup/invariants/post-restore-queries.sql`).
- **Honesty:** until funded replication, regional Spaces RPO may exceed 24h.

## OpenTofu state backend recovery

1. State lives in the Spaces state bucket with object versioning
   (`docs/infrastructure/ttw-060-opentofu-state-backend.md`).
2. Recovery: restore prior state object version → `tofu init` → plan against
   live resources; resolve drift before apply.
3. If the state bucket itself is lost and no off-provider copy exists, expect
   **import / rebuild** work that may miss the 24h regional RPO — same ADR honesty.
4. Never commit `*.tfstate`, `backend.hcl`, or plan binaries.

## Valkey loss → PostgreSQL-led reconcile / requeue

Valkey holds BullMQ queues and ephemeral session/cache material. On total loss:

1. Redeploy Valkey empty with `requirepass` from host secrets (TTW-063/065).
2. **Do not** replay Paystack charges, refunds, or payouts from queue payloads
   without idempotency keys already enforced in PostgreSQL (TTW-010–015).
3. Reconcile from authoritative tables (`payments`, `charge_settlement_claims`,
   `refunds`, `payouts`, inventory movements) using existing app reconcile jobs /
   runbooks.
4. Safe requeue only for jobs whose side effects are idempotent and whose
   business key is not already claimed.
5. Sessions: users re-authenticate; do not invent session restore from Valkey dumps.

## Isolated restore target

| Target                     | Use                                                                  |
| -------------------------- | -------------------------------------------------------------------- |
| `temporary-validation`     | Preferred isolated DigitalOcean project for restore drills           |
| `fra1` fallback            | Primary-region-loss rebuild (recovery-tagged; separate cost pool)    |
| Production cluster/Droplet | **Forbidden** as first restore destination without dual confirmation |

Checklist script: `infra/runtime/backup/scripts/restore-isolated-check.sh`.

- Prints the ordered steps for an isolated restore.
- **Fails loudly** if required env vars or evidence files are missing.
- **Does not mutate production** (no `tofu apply`, DNS change, or prod
  `pg_restore` in the script).

## Authorization (destructive restore)

Destructive failover, failback, production restoration, or DNS cutover
requires **explicit human authorization** and target confirmation:

1. Named owner approves the failure class and recovery point.
2. Operator confirms **target** (tmpval / fra1 / prod) aloud or in ticket.
3. Confirmation token env (e.g. `RESTORE_CONFIRM_TARGET=ttw-tmpval-…`) must
   match the intended resource name before any destructive CLI is run.
4. Record start time, RPO evidence, participants, and decision in the
   incident / TTW-067 evidence section.
5. Backup credentials and deletion rights remain separated from deploy identities.

## Runbook index

| Scenario                     | Runbook                                                |
| ---------------------------- | ------------------------------------------------------ |
| Droplet / host loss          | `infra/runtime/backup/runbooks/droplet-loss.md`        |
| PostgreSQL restore / PITR    | `infra/runtime/backup/runbooks/postgres-restore.md`    |
| Primary-region loss          | `infra/runtime/backup/runbooks/region-loss.md`         |
| Valkey / queue loss          | `infra/runtime/backup/runbooks/valkey-loss.md`         |
| Failback after recovery      | `infra/runtime/backup/runbooks/failback.md`            |
| Stale backup alert (TTW-066) | `infra/runtime/observability/runbooks/backup_stale.md` |

## Machine-readable policy

`infra/runtime/backup/policy.json` — RPO/RTO numbers, retention days, data
classes, and alert id `backup_stale` linking to TTW-066.

## Post-restore invariants

SELECT-only queries:
`infra/runtime/backup/invariants/post-restore-queries.sql`.

Compare counts/checksums for orders, payments, refunds, payouts, inventory,
and object key references against the recovery-point evidence capture.
Restored relationships must satisfy the same money/inventory invariants as
the source (TTW-010–015). Never replay external financial effects without
idempotency proof.

## Owner-gated (explicit deviations)

Credential-free CI validates policy schema, runbooks, executable scripts, and
secret-free tracked artefacts via `assert-backup-invariants`. The following
require the owner secret store and live DO accounts:

1. Live Managed PostgreSQL PITR restore into an isolated cluster.
2. Off-provider encrypted export schedule + monitored artefact delivery.
3. Spaces inventory/export against live buckets and version restore drill.
4. Clean-Droplet / `fra1` rebuild with Namecheap DNS cutover **rehearsal**.
5. Achieved RPO/RTO measurement and alert delivery acknowledgement for
   `backup_stale`.
6. Production destructive restore (never without dual human confirmation).

Unmet objectives after a rehearsal create **blocking follow-up tickets**.

## Policy gate

```bash
bash infra/policy/assert-backup-invariants.sh
# also via:
bash infra/scripts/validate-all.sh
```

## Related artefacts

| Path                                                       | Role                                |
| ---------------------------------------------------------- | ----------------------------------- |
| `infra/runtime/backup/policy.json`                         | RPO/RTO / retention / alert linkage |
| `infra/runtime/backup/scripts/*.sh`                        | Export / checklist sketches         |
| `infra/runtime/backup/runbooks/*.md`                       | Outage runbooks                     |
| `infra/runtime/backup/invariants/post-restore-queries.sql` | SELECT-only integrity checks        |
| `infra/policy/assert-backup-invariants.*`                  | Credential-free gates               |
| `docs/infrastructure/ttw-060-operations-access.md`         | Approved RPO ownership              |
| `docs/19-digitalocean-production-architecture-decision.md` | ADR-001 recovery honesty            |
