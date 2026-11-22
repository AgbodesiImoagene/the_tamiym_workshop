# TTW-250 — Check the format of the Paystack key at startup

**Epic:** 2 — Security and trust boundaries\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

TTW-248 made `PAYSTACK_SECRET_KEY` required in production and rejects known placeholders (`apps/api/src/config/env-validation.ts`). The review noted that an invented placeholder (`changeme`, `xxx`, `TODO`) or a value without the Paystack prefix still passes. This matches how the JWT and mail secrets are checked, so it was left as is.

## Proposal

In production only, require the key to start with `sk_live_` or `sk_test_`, with a clear error that never echoes the value. A test key stays accepted. Open decision for the owner: is `sk_test_` acceptable in production (it is today), or only `sk_live_`? Do not change that default without an answer.

## Invariants

- Development, staging and `NODE_ENV=test` do not change.
- The value is never logged or echoed.

## Implementation plan

1. Tests first in `env-validation.spec.ts`: wrong prefix fails, both valid prefixes pass, non-production unaffected.
2. Implement, update the environment docs, run the gates.

## Test and observability plan

- Unit tests only.

## References

- `docs/tickets/ttw-248-harden-paystack-webhook-and-key-check.md` — origin.
- `docs/infrastructure/ttw-065-identity-secrets.md`.

## Acceptance criteria

- [ ] Production refuses a key without a Paystack prefix.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Docs are updated.

## Out of scope

- Checking the key against Paystack at startup.

## Design review

To be recorded before implementation.

## Implementation reviews

To be recorded.

## Verification evidence

To be recorded.

## Completion summary

To be written at the end.
