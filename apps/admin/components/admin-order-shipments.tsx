'use client';

import { formatAdminDate } from '@/components/admin-shell';
import { AdminStatusBadge } from '@/components/admin-status-badge';
import {
  createAdminShipment,
  updateAdminShipmentStatus,
  type AdminShipment,
} from '@/lib/dashboard';
import { OrderStatus, ShipmentStatus } from '@tamiym/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@tamiym/ui';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';

// Mirrors SHIPMENT_ALLOWED_TRANSITIONS in apps/api/src/shipments/shipments.constants.ts.
// The API stays the authority: it answers 409/400 when a move is not allowed.
const NEXT_STATUSES: Record<string, ShipmentStatus[]> = {
  READY: [ShipmentStatus.DISPATCHED, ShipmentStatus.CANCELLED],
  DISPATCHED: [
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.EXCEPTION,
    ShipmentStatus.CANCELLED,
  ],
  IN_TRANSIT: [ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED, ShipmentStatus.EXCEPTION],
  OUT_FOR_DELIVERY: [ShipmentStatus.DELIVERED, ShipmentStatus.EXCEPTION],
  EXCEPTION: [
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.CANCELLED,
  ],
  DELIVERED: [],
  CANCELLED: [],
};

const ACTION_LABELS: Record<string, string> = {
  DISPATCHED: 'Mark as shipped',
  IN_TRANSIT: 'Mark in transit',
  OUT_FOR_DELIVERY: 'Mark out for delivery',
  DELIVERED: 'Mark as delivered',
  EXCEPTION: 'Report a problem',
  CANCELLED: 'Cancel shipment',
};

const CARRIERS = ['MANUAL', 'GIG', 'DHL', 'FEDEX', 'UPS', 'NIPOST', 'OTHER'];
const EXCEPTION_CODES = [
  'LATE',
  'LOST',
  'DAMAGED',
  'ADDRESS_FAILURE',
  'CUSTOMER_UNAVAILABLE',
  'OTHER',
];
const CAN_CREATE_FOR = new Set<string>([OrderStatus.PROCESSING, OrderStatus.FULFILLED]);
const TRACKING_REQUIRED = new Set<string>([
  ShipmentStatus.DISPATCHED,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.DELIVERED,
]);

const fieldClass = 'h-11 w-full rounded-xl border border-border bg-background px-3 text-sm';

function label(value: string) {
  return value.replaceAll('_', ' ').toLowerCase();
}

export function AdminOrderShipments({
  orderId,
  orderStatus,
  shipments,
  onChanged,
}: {
  orderId: string;
  orderStatus: string;
  shipments: AdminShipment[];
  onChanged: () => Promise<void>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [carrierCode, setCarrierCode] = useState('MANUAL');
  const [serviceCode, setServiceCode] = useState('');
  const [estimatedDeliveryAt, setEstimatedDeliveryAt] = useState('');
  const [privateNotes, setPrivateNotes] = useState('');
  const [openAction, setOpenAction] = useState<{ shipmentId: string; status: string } | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [exceptionCode, setExceptionCode] = useState('LATE');
  const [customerMessage, setCustomerMessage] = useState('');
  // One key per intent: a retry after a network error reuses it, so the API treats
  // it as the same request instead of recording a second event.
  const keys = useRef(new Map<string, string>());
  const keyFor = (intent: string) => {
    let key = keys.current.get(intent);
    if (!key) {
      key = `admin-shipment:${intent}:${crypto.randomUUID()}`;
      keys.current.set(intent, key);
    }
    return key;
  };

  const hasLiveShipment = shipments.some((s) => s.status !== ShipmentStatus.CANCELLED);
  const canCreate = CAN_CREATE_FOR.has(orderStatus) && !hasLiveShipment;

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminShipment(orderId, {
        carrierCode,
        serviceCode: serviceCode.trim() || undefined,
        estimatedDeliveryAt: estimatedDeliveryAt
          ? new Date(estimatedDeliveryAt).toISOString()
          : undefined,
        privateNotes: privateNotes.trim() || undefined,
        idempotencyKey: keyFor(`create:${orderId}`),
      }),
    onSuccess: async () => {
      keys.current.delete(`create:${orderId}`);
      setMessage('Shipment created.');
      setError(null);
      setServiceCode('');
      setEstimatedDeliveryAt('');
      setPrivateNotes('');
      await onChanged();
    },
    onError: (e: Error) => {
      setError(e.message || 'We could not create the shipment.');
      setMessage(null);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (input: { shipment: AdminShipment; status: string }) => {
      const intent = `${input.shipment.id}:${input.status}`;
      return updateAdminShipmentStatus(input.shipment.id, {
        status: input.status,
        idempotencyKey: keyFor(intent),
        trackingNumber: trackingNumber.trim() || undefined,
        trackingUrl: trackingUrl.trim() || undefined,
        exceptionCode: input.status === ShipmentStatus.EXCEPTION ? exceptionCode : undefined,
        customerMessage: customerMessage.trim() || undefined,
      });
    },
    onSuccess: async (_data, input) => {
      keys.current.delete(`${input.shipment.id}:${input.status}`);
      setMessage(`Shipment updated: ${label(input.status)}.`);
      setError(null);
      setOpenAction(null);
      await onChanged();
    },
    onError: (e: Error) => {
      setError(e.message || 'We could not update the shipment.');
      setMessage(null);
    },
  });

  function startAction(shipment: AdminShipment, status: string) {
    setOpenAction({ shipmentId: shipment.id, status });
    setTrackingNumber(shipment.trackingNumber ?? '');
    setTrackingUrl(shipment.trackingUrl ?? '');
    setCustomerMessage('');
    setExceptionCode('LATE');
    setError(null);
    setMessage(null);
  }

  const trackingMissing =
    openAction !== null && TRACKING_REQUIRED.has(openAction.status) && !trackingNumber.trim();

  return (
    <Card className="rounded-[1.75rem] border-border shadow-none" data-testid="admin-shipments">
      <CardHeader>
        <CardTitle>Shipment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {shipments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canCreate
              ? 'No shipment yet. Create one when the order leaves the workshop.'
              : `No shipment. A shipment can be created once the order is processing (current status: ${label(orderStatus)}).`}
          </p>
        ) : null}

        {shipments.map((shipment) => {
          const next = NEXT_STATUSES[shipment.status] ?? [];
          const active = openAction?.shipmentId === shipment.id ? openAction : null;
          return (
            <div
              key={shipment.id}
              className="space-y-4 rounded-2xl border border-border bg-muted p-4"
              data-testid="admin-shipment"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <AdminStatusBadge value={shipment.status} />
                <p className="text-xs text-muted-foreground">
                  {shipment.carrierName || shipment.carrierCode}
                  {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
                </p>
              </div>
              {shipment.estimatedDeliveryAt ? (
                <p className="text-xs text-muted-foreground">
                  Estimated delivery: {formatAdminDate(shipment.estimatedDeliveryAt)}
                </p>
              ) : null}
              {shipment.exceptionCode ? (
                <p className="text-sm text-destructive">
                  Problem reported: {label(shipment.exceptionCode)}
                </p>
              ) : null}

              {next.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {next.map((status) => (
                    <Button
                      key={status}
                      type="button"
                      size="sm"
                      variant={status === ShipmentStatus.CANCELLED ? 'secondary' : 'default'}
                      onClick={() => startAction(shipment, status)}
                      disabled={statusMutation.isPending}
                    >
                      {ACTION_LABELS[status]}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">This shipment is closed.</p>
              )}

              {active ? (
                <form
                  className="space-y-3 rounded-xl border border-border bg-background p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    statusMutation.mutate({ shipment, status: active.status });
                  }}
                >
                  <p className="text-sm font-semibold">{ACTION_LABELS[active.status]}</p>
                  {TRACKING_REQUIRED.has(active.status) ? (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="trackingNumber">Tracking number</Label>
                        <Input
                          id="trackingNumber"
                          value={trackingNumber}
                          onChange={(e) => setTrackingNumber(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="trackingUrl">Tracking link (optional)</Label>
                        <Input
                          id="trackingUrl"
                          type="url"
                          value={trackingUrl}
                          onChange={(e) => setTrackingUrl(e.target.value)}
                          placeholder="https://"
                        />
                      </div>
                    </>
                  ) : null}
                  {active.status === ShipmentStatus.EXCEPTION ? (
                    <div className="space-y-1">
                      <Label htmlFor="exceptionCode">Problem</Label>
                      <select
                        id="exceptionCode"
                        className={fieldClass}
                        value={exceptionCode}
                        onChange={(e) => setExceptionCode(e.target.value)}
                      >
                        {EXCEPTION_CODES.map((code) => (
                          <option key={code} value={code}>
                            {label(code)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label htmlFor="customerMessage">Message to the customer (optional)</Label>
                    <Textarea
                      id="customerMessage"
                      maxLength={500}
                      value={customerMessage}
                      onChange={(e) => setCustomerMessage(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={statusMutation.isPending || trackingMissing}>
                      {statusMutation.isPending ? 'Saving...' : 'Confirm'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => setOpenAction(null)}>
                      Back
                    </Button>
                  </div>
                </form>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  History
                </p>
                <ol className="space-y-2" aria-label="Shipment history">
                  {shipment.events.map((event) => (
                    <li key={event.id} className="text-sm">
                      <span className="font-medium">{label(event.type)}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        · {formatAdminDate(event.occurredAt)}
                        {event.exceptionCode ? ` · ${label(event.exceptionCode)}` : ''}
                      </span>
                      {event.customerMessage ? (
                        <p className="text-xs text-muted-foreground">{event.customerMessage}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          );
        })}

        {canCreate ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="carrierCode">Carrier</Label>
              <select
                id="carrierCode"
                className={fieldClass}
                value={carrierCode}
                onChange={(e) => setCarrierCode(e.target.value)}
              >
                {CARRIERS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="serviceCode">Service (optional)</Label>
              <Input
                id="serviceCode"
                value={serviceCode}
                maxLength={64}
                onChange={(e) => setServiceCode(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="estimatedDeliveryAt">Estimated delivery (optional)</Label>
              <Input
                id="estimatedDeliveryAt"
                type="date"
                value={estimatedDeliveryAt}
                onChange={(e) => setEstimatedDeliveryAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="shipmentNotes">Private note (optional)</Label>
              <Textarea
                id="shipmentNotes"
                maxLength={1000}
                value={privateNotes}
                onChange={(e) => setPrivateNotes(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create shipment'}
            </Button>
          </form>
        ) : null}

        {message ? (
          <p role="status" className="text-sm text-emerald-700">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
