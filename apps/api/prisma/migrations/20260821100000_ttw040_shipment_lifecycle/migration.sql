-- TTW-040: carrier-neutral shipment + append-only events (slice 1).
-- Historical orders are left without synthetic shipment rows.

CREATE TYPE "ShipmentDirection" AS ENUM ('OUTBOUND', 'RETURN');

CREATE TYPE "ShipmentStatus" AS ENUM (
  'READY',
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
  'CANCELLED'
);

CREATE TYPE "ShipmentEventType" AS ENUM (
  'READY',
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
  'CANCELLED',
  'CORRECTION'
);

CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "direction" "ShipmentDirection" NOT NULL DEFAULT 'OUTBOUND',
    "status" "ShipmentStatus" NOT NULL DEFAULT 'READY',
    "carrierCode" TEXT NOT NULL DEFAULT 'MANUAL',
    "carrierName" TEXT,
    "serviceCode" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "carrierTrackingKey" TEXT,
    "estimatedDeliveryAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "exceptionCode" TEXT,
    "exceptionMessageCustomer" TEXT,
    "exceptionNotesInternal" TEXT,
    "policyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipment_events" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" "ShipmentEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "source" "AuditSource" NOT NULL DEFAULT 'ADMIN_API',
    "idempotencyKey" TEXT NOT NULL,
    "customerMessage" TEXT,
    "privateNotes" TEXT,
    "exceptionCode" TEXT,
    "supersedesEventId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shipments_orderId_idx" ON "shipments"("orderId");
CREATE INDEX "shipments_status_createdAt_idx" ON "shipments"("status", "createdAt");
CREATE INDEX "shipments_carrierTrackingKey_idx" ON "shipments"("carrierTrackingKey");

-- v1: at most one active outbound shipment per order.
CREATE UNIQUE INDEX "shipments_one_active_outbound_per_order"
ON "shipments" ("orderId")
WHERE "direction" = 'OUTBOUND' AND "status" <> 'CANCELLED';

-- Tracking uniqueness when a tracking number is present.
CREATE UNIQUE INDEX "shipments_carrier_tracking_unique"
ON "shipments" ("carrierTrackingKey")
WHERE "carrierTrackingKey" IS NOT NULL;

CREATE UNIQUE INDEX "shipment_events_shipmentId_idempotencyKey_key"
ON "shipment_events"("shipmentId", "idempotencyKey");

CREATE INDEX "shipment_events_shipmentId_occurredAt_idx"
ON "shipment_events"("shipmentId", "occurredAt");

CREATE INDEX "shipment_events_type_recordedAt_idx"
ON "shipment_events"("type", "recordedAt");

ALTER TABLE "shipments"
ADD CONSTRAINT "shipments_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shipment_events"
ADD CONSTRAINT "shipment_events_shipmentId_fkey"
FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shipment_events"
ADD CONSTRAINT "shipment_events_supersedesEventId_fkey"
FOREIGN KEY ("supersedesEventId") REFERENCES "shipment_events"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
