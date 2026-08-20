# Dependency security policy (TTW-022)

## Release bar

- Production installs (`pnpm audit --prod`) must report **zero critical and zero high** advisories.
- CI job `Production Audit` blocks PRs that regress this bar (`pnpm audit:prod`).
- Moderate/low findings may remain only with an owner, reachability note, mitigation, and expiry in a follow-up ticket.

## Update automation

- Dependabot (`.github/dependabot.yml`) opens grouped weekly PRs for npm.
- Scheduled workflow `.github/workflows/dependency-audit.yml` runs Mondays; failures are owned by engineering on-call.

## Allowed remediations

1. Upgrade the direct root package (preferred).
2. Replace an unused / mis-scoped package (e.g. move CLI packages to `devDependencies`, replace unused template engines).
3. Targeted `pnpm.overrides` for **patched** transitive versions when no compatible parent bump exists yet — each override must map to an advisory in the TTW-022 table.
4. Never use `--force`, blanket audit ignores, or `audit-level` lowering to hide critical/high findings.

## Rollback

Revert the merge commit that introduced the lockfile/package.json change and redeploy the prior image digest.
