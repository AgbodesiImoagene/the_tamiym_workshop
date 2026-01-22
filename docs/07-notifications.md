# Notifications (Owner Alerts + User Notifications)

## Requirement

Notify business owners on key events: orders, refunds, payout changes, moderation flags.

## Event-driven model

Emit domain events and handle them asynchronously (preferred):

- `OrderPlaced`
- `PaymentConfirmed`
- `RefundInitiated`
- `RefundSucceeded`
- `PayoutInitiated`
- `PayoutSucceeded`
- `DesignFlagged`
- `CampaignCreated`
- `CampaignDisabled`

## Delivery channels (v1)

- Email to owners (recommended baseline)
- Optional: Slack webhook for instant ops notifications
- Optional: SMS for urgent events

## Implementation

- Use an outbox table to guarantee delivery (transactional events).
- A worker consumes events and sends notifications.
- All notifications are templated; keep templates versioned in repo.
