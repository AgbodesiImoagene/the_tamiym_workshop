# Observability — Structured Logging + OpenTelemetry

## Requirements

- Structured JSON logging
- Metrics (counters, histograms) for core flows
- Traces for request flows and critical operations

## Logging

- Use pino logger
- Include correlation/request ID on every log line
- Redact sensitive fields (tokens, passwords, payment details)

## Metrics (examples)

- `orders_created_total`
- `payments_succeeded_total`
- `refunds_initiated_total`
- `payouts_failed_total`
- `designs_saved_total`

## Traces

Instrument:

- Checkout initiation
- Paystack webhook handling
- Admin order status updates
- Design save/export
- Payout transfer flows

## Export

Use OpenTelemetry Collector in docker for routing.
