# TTW-273 — Hide unpublished products on the public workshop route

**Epic:** 8 — Client review delivery\
**Status:** In review (verified 2026-11-28; not committed, no separate reviewer yet)\
**Risk:** High (public route, data exposure)\
**Blocked by:** None\
**Blocks:** None

## Background

`GET /v1/products/:id/workshop` is public and looks the product up by id only (`ProductsService.getWorkshopContext`), while `findOne` also requires `status: ACTIVE`. Anyone who knows the id of a draft or archived product can read its name, options, views, print areas and layers.

Reproduced on 2026-11-28 with a temporary API e2e test on a throwaway database: for a `DRAFT` and an `ARCHIVED` product, `GET /v1/products/:id` answered 404 and the anonymous `GET /v1/products/:id/workshop` answered 200 with the name and the view.

`docs/audit-findings.md` H-2 reports this finding as fixed for both reads; only `findOne` was.

The route has three callers, all in `apps/app` (`getProductWorkshop`): the new design page, the saved design editor (`EditDesignLoader`) and the public shared design page. `apps/admin` does not call it.

## Proposal

Product owner decision (2026-11-28): block everyone, with no exception for the owner of a saved design. A saved design on an unpublished product stays stored and opens again when the product is published again. The "Order" button of such a design already leads to "This product could not be found", so reopening it had little use.

1. `getWorkshopContext` also requires `status: ACTIVE` and answers 404 otherwise.
2. `EditDesignLoader`: when the design loads and its workshop answers 404, say "This product is no longer available. Your design is saved." with a link back, instead of the connection error with "Try again".
3. No change to the two other screens: the new design page shows "not found", the shared page falls back to the design thumbnail.
4. Swagger describes the 404; the audit table is corrected.

Rejected: an exception for the signed-in owner of a design (little use, one more access rule to protect).

## Invariants

- The public catalogue reads (list, detail, categories, workshop) never return a product that is not `ACTIVE`.
- Saved designs are not changed or deleted.
- A published product's workshop response is unchanged.
- A server or network failure still offers "Try again".

## Implementation plan

1. Pin the current behaviour (published product, unknown id), then write the tests of the new one and see them fail.
2. API filter and Swagger, `pnpm openapi:generate`.
3. Edit screen message.
4. Playwright coverage, docs.
5. Gates, browser run on a throwaway database, review.

## Test and observability plan

- API unit: the lookup requires `ACTIVE`.
- API integration (real Postgres): published 200 with the same shape; draft, archived and unknown 404, for an anonymous caller, the owner of a design and an admin; 200 again once republished; the saved design is intact.
- App Jest: the new message and its link on a workshop 404, no "Try again"; other errors unchanged; shared page thumbnail fallback already covered.
- Playwright: a customer reopens a design after the product is archived.
- Logs, metrics, traces and alerts: nothing new.

## References

- `apps/api/src/products/products.service.ts` — `findOne`, `getWorkshopContext`.
- `apps/api/src/products/products.controller.ts` — `getWorkshop`.
- `apps/app/components/workshop/EditDesignLoader.tsx` — error states.
- `docs/audit-findings.md` — H-2.

## Acceptance criteria

- [x] The workshop route answers 404 for a draft or archived product, whoever asks.
- [x] The workshop route answers as before for a published product.
- [x] Reopening a design on an unpublished product shows the message and a way back.
- [x] Required quality gates pass with evidence recorded below.
- [x] Swagger, OpenAPI, Playwright coverage and documentation are updated.

## Out of scope

- Ordering an unpublished product through the API: being checked separately.
- Hiding or disabling "Edit", "Order" and "Duplicate" on such designs in the design list.
- Reading, renaming or duplicating a saved design on an unpublished product (unchanged).

## Design review

Reviewer: implementing session (Claude), 2026-11-28, before implementation.

- Blast radius: one public read, one customer screen. No schema change.
- Duplication: reuses the filter `findOne` already applies.
- Interfaces: the route answers 404 in more cases, same error body as an unknown product.
- Security: the same 404 and message for unknown and unpublished ids, so the answer does not reveal that a draft exists.
- Edge cases: product archived while the editor is open (the next save is unchanged, the next load shows the message); product published again (works again).
- Risks: customers with designs on withdrawn products lose access to the editor until republication (accepted by the product owner); shared links show the thumbnail instead of the canvas; the design list still offers "Edit".
- Verdict: proceed.

## Implementation reviews

2026-11-28, `/code-review medium` run inline by the implementing session (not a separate reviewer), with a security pass. No finding introduced by the filter itself. The other public product reads (list, detail, categories) already require `ACTIVE`; `getWorkshopContext` has one caller, the route.

Four notes, none fixed here:

1. A shared link of a withdrawn product falls back to the thumbnail, which can be missing, or refused once the design is no longer `APPROVED`.
2. The shared design read still returns the id, name and slug of an unpublished product to holders of the link.
3. Existing: `POST /designs` answers differently for an unpublished product and an unknown id.
4. The design list still offers "Edit" and "Order" on such designs (out of scope).

## Verification evidence

Run on 2026-11-28, branch `claude/ttw-273-hide-unpublished-workshop` from `main` `2fa96bb`, uncommitted, Node 24.

- Tests first, seen failing for the right reason: service spec 1 failed (no status filter), 2 pins passed; API e2e 7 failed, 2 pins passed; `EditDesignLoader.test.tsx` 1 failed, 7 passed.
- After the change: `test/workshop-unpublished-product.e2e-spec.ts` (real Postgres, throwaway database) 9 passed; `jest src/products` 7 suites, 142 passed; app `jest __tests__/workshop __tests__/shared-design` 20 suites, 113 passed.
- `typecheck` api and app, app `lint`, eslint on the changed API files, `format:check`, `openapi:check`, `docs:validate`, `playwright:validate`: passed.
- Production builds of `api` and `app`, then Playwright on a second throwaway database, ports 3101-3102: `setup`, the `design-workshop` specs, `shared-design.canvas`, `design-order` and a temporary real-flow spec: 31 passed. The real flow, with no intercepted request: save a design, archive the product as admin, see the message at 1440 and 390 px, go back to the list, get 404 on the new design page, publish again and reopen the design.
- The committed Playwright test intercepts the workshop request with a 404, because archiving a seeded product would disturb the specs running in parallel.
- Both throwaway databases, Redis database 7 and the temporary files were removed.
- Not verified: the whole API e2e and app Jest suites, the other Playwright specs, CI (nothing pushed), the shared page of a withdrawn product in a browser (unit test of the fallback only).

## Completion summary

Done: the workshop route answers 404 for draft and archived products; the saved design editor says "This product is no longer available. Your design is saved."; Swagger, OpenAPI and the audit note are updated. No schema change.

Left: commit and merge (on the user's request), a separate reviewer, CI. Possible conflicts: TTW-267, TTW-269 and TTW-274 in the products files, the ticket index and the generated OpenAPI files; regenerate the latter with `pnpm openapi:generate`.
