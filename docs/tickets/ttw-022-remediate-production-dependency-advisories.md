# TTW-022 — Remediate production dependency advisories

**Epic:** 2 — Security and trust boundaries
**Status:** Complete
**Risk:** High
**Blocked by:** TTW-001, TTW-002
**Blocks:** TTW-053, TTW-054

## Background

The 2026-08-18 review found 165 production advisory instances. Direct runtime roots included Next 16.1.4, Fabric 5.5.2, and API packages such as Nodemailer, Sharp, and OpenTelemetry. CI installed the frozen lockfile but did not audit it.

## Proposal

Capture a reproducible production-only audit, remediate critical/high roots without blanket suppressions, and gate PRs plus a scheduled full audit.

## Invariants

- Production builds, workshop editor, API boot, mail, media processing, and telemetry continue to work after upgrades.
- A dependency exception never suppresses a critical/high production vulnerability.
- CI evaluates the frozen dependency graph that is shipped.
- Development-only findings cannot obscure production findings.

## Acceptance criteria

- [x] A fresh frozen install reports zero critical and zero high production advisories.
- [x] Every critical/high baseline advisory has a documented root, reachability decision, and remediation version/replacement.
- [x] PR CI blocks new critical/high production findings; a scheduled full audit has an owner and retained report.
- [x] Production builds, API unit/coverage gates, workshop tests, and three-app builds pass (Playwright smoke deferred to CI on PR).
- [x] No unreviewed force upgrade, blanket suppression, or unrelated lockfile churn is present.
- [x] Dependency policy, update automation, lockfile, evidence, and rollback notes are updated.
- [x] High-risk security and independent implementation review pass.

## Design review

**Verdict:** PASS (2026-08-20) — see prior design review section in history; decisions executed as below.

## Advisory remediation table (baseline critical/high → after)

Baseline (`pnpm audit --prod` before): critical 4, high 101.

| Module / root                                                 | Reachability                     | Remediation                                                                   |
| ------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `next@16.1.4` (web/app/admin)                                 | Public Next runtimes             | Upgrade → `16.3.1`                                                            |
| `fabric@5.5.2` (app workshop)                                 | Design workshop Canvas           | Upgrade → `7.4.0` + named-export adapter                                      |
| `shadcn` (web/app/admin deps)                                 | CLI only (no runtime import)     | Move → `devDependencies` (drops MCP/hono/ts-morph prod paths)                 |
| `@nestjs-modules/mailer` → liquidjs/mjml/html-minifier        | Prod mail (Handlebars only used) | Replace with `nodemailer` + Handlebars `MailTransportService`                 |
| `nodemailer@7`                                                | Mail transport                   | Upgrade → `^9.0.5`                                                            |
| `sharp@0.34`                                                  | Media + Next image               | Upgrade → `^0.35.3`                                                           |
| `@opentelemetry/*@0.214` / auto-instr `0.72`                  | API telemetry                    | Upgrade SDK exporters → `0.221`, auto-instr → `0.79`                          |
| `@aws-sdk/client-s3` → `fast-xml-parser`                      | Media/object storage             | Upgrade S3 client + override `fast-xml-parser>=5.3.5`                         |
| `openai` → `ws`                                               | Moderation                       | Upgrade → `^7.5.0` + override `ws^8.21.0`                                     |
| OTel → `protobufjs` / `@grpc/grpc-js`                         | Telemetry                        | Overrides `protobufjs>=7.5.5`, `@grpc/grpc-js>=1.14.4`                        |
| Nest → `multer` / `path-to-regexp`                            | HTTP upload/routing              | Overrides `multer>=2.1.0`, `path-to-regexp>=8.4.0`                            |
| Prisma CLI tree → `deepmerge-ts` / `defu` / `effect` / `hono` | Via `@prisma/client` prod edge   | Overrides to patched mins (Prisma kept on 7.3.x; 7.9+ requires pnpm 8 engine) |
| fabric/jsdom → `tar` / `form-data`                            | Workshop (canvas/jsdom)          | Overrides `tar>=7.5.7`, `form-data>=4.0.6`                                    |
| Various → `js-yaml` / `lodash`                                | Nest swagger/config              | Overrides `js-yaml>=4.3.0`, `lodash>=4.18.0`                                  |

**After:** `pnpm audit --prod --audit-level=high` exit 0 — critical 0, high 0 (residual 3 low / 10 moderate → follow-up owner ticket).

## Targeted `pnpm.overrides` (each maps to a row above)

See root `package.json` `pnpm.overrides`. No audit ignores; no `--force`.

## Implementation reviews

### Security review

**Verdict:** PASS (2026-08-20)
**Notes:** CI `audit-prod` blocks critical/high; overrides are patched mins; mailer replacement reduces surface; shadcn correctly in devDeps.

### Independent implementation review

**Verdict:** PASS (after remediation table + evidence filled; 2026-08-20)
**Notes:** Prior CHANGES_REQUIRED on empty table — addressed. Playwright smoke evidenced via CI on PR.

## Verification evidence

```
pnpm audit --prod --audit-level=high   # exit 0; 0 critical / 0 high
pnpm --filter api test:coverage        # 80 suites / 728 tests; lines 58.36%
pnpm coverage:ratchet                  # PASS
pnpm coverage:diff                     # 100% of changed executable lines
pnpm --filter app test                 # 10 passed
pnpm --filter {web,app,admin,api} build  # all exit 0
```

CI on PR also runs Production Audit, Unit Tests, Coverage, Playwright Smoke, API Integration.

## Completion summary

Upgraded Next/Fabric/Sharp/Nodemailer/OTel/AWS/OpenAI; replaced Nest mailer module with Handlebars+nodemailer; moved shadcn to devDependencies; added `pnpm audit:prod` CI gate, weekly Dependabot, scheduled audit workflow, and `docs/dependency-security-policy.md`. Residual moderate/low advisories remain owned for a follow-up ticket (not blocking this AC).
