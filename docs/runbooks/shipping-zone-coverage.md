# Runbook — Shipping zone coverage (admin handover)

**Owner:** admin operations  
**Ticket:** TTW-086 (client review row 5.6, client answer Q22)  
**When:** At handover to the workshop admins, and whenever delivery areas change

## Purpose

Checkout only accepts an address that a shipping zone covers. A covered address needs an active zone that matches it and an active rate on that zone. If nothing matches, the customer cannot order to that address. The platform never charges a ₦0 delivery fee by default, because the workshop would then pay for delivery.

The client chose this rule for now (Q22: "for now reject"). A default rate for uncovered addresses is out of scope until the client asks for it as an admin setting.

## What admins must do at handover

1. Enter **every** area the workshop delivers to as a shipping zone, with matching rules (state, LGA, city or postal code).
2. Give each zone at least one **active** rate in NGN for the `STANDARD` service level. Check its effective dates.
3. Use an explicit ₦0 rate only where delivery really is free. It is accepted as entered.
4. Test one address per zone with a checkout quote before go-live.

## What the customer sees

On the standard checkout and the fundraiser checkout, "Review quote" (or "Place order") on an uncovered address shows:

> We don't deliver to this address yet. Check the state and LGA, or use another delivery address. Your cart is saved.

No total is shown and no order is created. The cart stays as it is. After correcting the address, the customer can quote again.

## API contract

`POST /v1/orders/quote`, `POST /v1/orders`, `POST /v1/campaigns/{id}/orders/quote` and `POST /v1/campaigns/{id}/orders` answer `400` with the body `{ "code": "SHIPPING_ADDRESS_NOT_COVERED", "message": "…" }`. Nothing is written and no stock is reserved. A retry with the same idempotency key after the address is corrected creates the order (TTW-037).

## Spotting a missing zone

Each refusal logs a warning from `PricingService`:

```
Quote refused: address not covered by any shipping rate (reason=NO_ZONE|NO_RATE, country=NG, state=<code or none>, zone=<id or none>)
```

- `NO_ZONE`: no active zone rule matches the address. Add or fix a zone rule for that state or LGA.
- `NO_RATE`: a zone matches, but it has no active rate today. Add a rate or fix its dates.

The log carries no street, city, name or user id. Repeated warnings for the same state usually mean that a zone is missing.

`state=none` means the saved address names a state the platform does not recognise. Since TTW-087 this can only be an address saved before that change: the checkout forms offer the states and LGAs as lists, and the API refuses to save or to change an address to a Nigerian state it does not know (400 `ADDRESS_STATE_UNKNOWN`), so the saved state and LGA are never replaced by a guess (this replaces the TTW-185 rule that dropped the old state code on such an edit). An older address with an unknown state still loads; editing only the phone or street keeps it as it is, and the checkout asks the customer to choose a state from the list before a quote. Customers read the lists from `GET /v1/geo/states` and `GET /v1/geo/states/:code/lgas`.
