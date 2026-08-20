'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Selection changes intentionally reset the route editor. */

import { AdminShell, formatAdminDate } from '@/components/admin-shell';
import {
  createAdminNotificationRoute,
  deleteAdminNotificationRoute,
  getAdminNotificationEventCatalog,
  getAdminNotificationRoutes,
  sendAdminBroadcastEmail,
  updateAdminNotificationRoute,
  type AdminBroadcastResult,
  type AdminEmailAudience,
  type AdminNotificationRoute,
} from '@/lib/notifications';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

type RouteFormState = {
  eventKey: string;
  name: string;
  enabled: boolean;
  notifyEmail: boolean;
  emailRecipients: string;
  notifySms: boolean;
  smsRecipients: string;
  notifySlack: boolean;
  slackWebhookUrl: string;
  subjectTemplate: string;
  emailBodyTemplate: string;
  smsBodyTemplate: string;
};

type BroadcastFormState = {
  audience: AdminEmailAudience;
  userIds: string;
  subject: string;
  htmlBody: string;
};

const emptyRouteForm: RouteFormState = {
  eventKey: '',
  name: 'default',
  enabled: true,
  notifyEmail: true,
  emailRecipients: '',
  notifySms: false,
  smsRecipients: '',
  notifySlack: false,
  slackWebhookUrl: '',
  subjectTemplate: '',
  emailBodyTemplate: '',
  smsBodyTemplate: '',
};

const emptyBroadcastForm: BroadcastFormState = {
  audience: 'VERIFIED_CUSTOMERS_AND_ORGANIZERS',
  userIds: '',
  subject: '',
  htmlBody: '<p>Hello from Tamiym admin.</p>',
};

function parseList(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toRouteFormState(route: AdminNotificationRoute): RouteFormState {
  return {
    eventKey: route.eventKey,
    name: route.name,
    enabled: route.enabled,
    notifyEmail: route.notifyEmail,
    emailRecipients: route.emailRecipients.join('\n'),
    notifySms: route.notifySms,
    smsRecipients: route.smsRecipients.join('\n'),
    notifySlack: route.notifySlack,
    slackWebhookUrl: route.slackWebhookUrl ?? '',
    subjectTemplate: route.subjectTemplate ?? '',
    emailBodyTemplate: route.emailBodyTemplate ?? '',
    smsBodyTemplate: route.smsBodyTemplate ?? '',
  };
}

function RouteRow({
  route,
  selected,
  onSelect,
}: {
  route: AdminNotificationRoute;
  selected: boolean;
  onSelect: (route: AdminNotificationRoute) => void;
}) {
  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${
        selected ? 'border-primary bg-primary-50/40' : 'border-border bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-primary">{route.eventKey}</p>
            <Badge variant={route.enabled ? 'accent' : 'neutral'}>
              {route.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            <Badge variant="brand">{route.name}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Channels:
            {route.notifyEmail ? ' Email' : ''}
            {route.notifySms ? ' SMS' : ''}
            {route.notifySlack ? ' Slack' : ''}
            {!route.notifyEmail && !route.notifySms && !route.notifySlack ? ' None' : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            Updated {formatAdminDate(route.updatedAt)}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onSelect(route)}>
          Edit
        </Button>
      </div>
    </div>
  );
}

export default function AdminNotificationsPage() {
  const queryClient = useQueryClient();
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeForm, setRouteForm] = useState<RouteFormState>(emptyRouteForm);
  const [broadcastForm, setBroadcastForm] = useState<BroadcastFormState>(emptyBroadcastForm);
  const [routeMessage, setRouteMessage] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState<string | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcastResult, setBroadcastResult] = useState<AdminBroadcastResult | null>(null);

  const routesQuery = useQuery({
    queryKey: ['admin-notification-routes'],
    queryFn: getAdminNotificationRoutes,
  });
  const eventCatalogQuery = useQuery({
    queryKey: ['admin-notification-event-catalog'],
    queryFn: getAdminNotificationEventCatalog,
  });

  const selectedRoute = useMemo(
    () => routesQuery.data?.find((route) => route.id === selectedRouteId) ?? null,
    [routesQuery.data, selectedRouteId]
  );

  useEffect(() => {
    if (selectedRoute) {
      setRouteForm(toRouteFormState(selectedRoute));
      return;
    }
    setRouteForm(emptyRouteForm);
  }, [selectedRoute]);

  const routeMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        enabled: routeForm.enabled,
        notifyEmail: routeForm.notifyEmail,
        emailRecipients: parseList(routeForm.emailRecipients),
        notifySms: routeForm.notifySms,
        smsRecipients: parseList(routeForm.smsRecipients),
        notifySlack: routeForm.notifySlack,
        slackWebhookUrl: routeForm.slackWebhookUrl.trim() || null,
        subjectTemplate: routeForm.subjectTemplate.trim() || null,
        emailBodyTemplate: routeForm.emailBodyTemplate.trim() || null,
        smsBodyTemplate: routeForm.smsBodyTemplate.trim() || null,
      };

      if (selectedRoute) {
        return updateAdminNotificationRoute(selectedRoute.id, payload);
      }

      return createAdminNotificationRoute({
        eventKey: routeForm.eventKey,
        name: routeForm.name.trim() || 'default',
        ...payload,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-notification-routes'] });
      setRouteMessage(
        selectedRoute ? 'Notification route updated.' : 'Notification route created.'
      );
      setRouteError(null);
      if (!selectedRoute) {
        setRouteForm(emptyRouteForm);
      }
    },
    onError: (mutationError: { message?: string }) => {
      setRouteError(mutationError.message || 'We could not save the notification route.');
      setRouteMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminNotificationRoute(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-notification-routes'] });
      setSelectedRouteId(null);
      setRouteForm(emptyRouteForm);
      setRouteMessage('Notification route deleted.');
      setRouteError(null);
    },
    onError: (mutationError: { message?: string }) => {
      setRouteError(mutationError.message || 'We could not delete the notification route.');
      setRouteMessage(null);
    },
  });

  const broadcastMutation = useMutation({
    mutationFn: (dryRun: boolean) =>
      sendAdminBroadcastEmail({
        audience: broadcastForm.audience,
        userIds:
          broadcastForm.audience === 'USER_IDS' ? parseList(broadcastForm.userIds) : undefined,
        subject: broadcastForm.subject.trim(),
        htmlBody: broadcastForm.htmlBody,
        dryRun,
      }),
    onSuccess: (result, dryRun) => {
      setBroadcastResult(result);
      setBroadcastError(null);
      setBroadcastMessage(
        dryRun
          ? 'Broadcast preview generated.'
          : `Broadcast queued for ${result.recipientCount} recipient(s).`
      );
    },
    onError: (mutationError: { message?: string }) => {
      setBroadcastError(mutationError.message || 'We could not process the broadcast.');
      setBroadcastMessage(null);
    },
  });

  const eventDescriptions = new Map(
    (eventCatalogQuery.data ?? []).map((event) => [event.key, event.description])
  );

  function beginCreateRoute() {
    setSelectedRouteId(null);
    setRouteForm(emptyRouteForm);
    setRouteMessage(null);
    setRouteError(null);
  }

  return (
    <AdminShell
      activeNav="notifications"
      title="Notifications"
      description="Configure admin event routes and queue broadcast emails to verified user segments."
    >
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="rounded-[1.75rem] border-border shadow-none">
            <CardHeader>
              <CardTitle>Notification routes</CardTitle>
              <CardDescription>
                Routes subscribe specific channels and recipients to operational admin events.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {routesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading notification routes...</p>
              ) : routesQuery.isError ? (
                <p className="text-sm text-red-700">We could not load notification routes.</p>
              ) : routesQuery.data && routesQuery.data.length > 0 ? (
                routesQuery.data.map((route) => (
                  <RouteRow
                    key={route.id}
                    route={route}
                    selected={route.id === selectedRouteId}
                    onSelect={(item) => {
                      setSelectedRouteId(item.id);
                      setRouteMessage(null);
                      setRouteError(null);
                    }}
                  />
                ))
              ) : (
                <EmptyState
                  title="No notification routes yet"
                  description="Create the first route to start forwarding admin events to email, SMS, or Slack."
                />
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-border shadow-none">
            <CardHeader>
              <CardTitle>{selectedRoute ? 'Edit route' : 'Create route'}</CardTitle>
              <CardDescription>
                Event key and route name are fixed after creation. Channel settings and templates
                stay editable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="eventKey">Event key</Label>
                <Select
                  value={routeForm.eventKey}
                  onValueChange={(val) =>
                    setRouteForm((current) => ({ ...current, eventKey: val }))
                  }
                  disabled={Boolean(selectedRoute)}
                >
                  <SelectTrigger id="eventKey" className="h-11 w-full rounded-xl">
                    <SelectValue placeholder="Select event" />
                  </SelectTrigger>
                  <SelectContent>
                    {(eventCatalogQuery.data ?? []).map((event) => (
                      <SelectItem key={event.key} value={event.key}>
                        {event.key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {routeForm.eventKey ? (
                  <p className="text-xs text-muted-foreground">
                    {eventDescriptions.get(routeForm.eventKey)}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="routeName">Route name</Label>
                <Input
                  id="routeName"
                  value={routeForm.name}
                  disabled={Boolean(selectedRoute)}
                  onChange={(event) =>
                    setRouteForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="default"
                />
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                <Checkbox
                  className="mt-1"
                  checked={routeForm.enabled}
                  onCheckedChange={(checked) =>
                    setRouteForm((current) => ({ ...current, enabled: checked as boolean }))
                  }
                />
                <div>
                  <p className="text-sm font-semibold text-foreground">Route enabled</p>
                  <p className="text-xs text-muted-foreground">
                    Disable the route to temporarily stop fan-out without deleting the
                    configuration.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                <Checkbox
                  className="mt-1"
                  checked={routeForm.notifyEmail}
                  onCheckedChange={(checked) =>
                    setRouteForm((current) => ({ ...current, notifyEmail: checked as boolean }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Email notifications</p>
                  <Textarea
                    value={routeForm.emailRecipients}
                    onChange={(event) =>
                      setRouteForm((current) => ({
                        ...current,
                        emailRecipients: event.target.value,
                      }))
                    }
                    placeholder="ops@example.com&#10;finance@example.com"
                    className="mt-3"
                  />
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                <Checkbox
                  className="mt-1"
                  checked={routeForm.notifySms}
                  onCheckedChange={(checked) =>
                    setRouteForm((current) => ({ ...current, notifySms: checked as boolean }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">SMS notifications</p>
                  <Textarea
                    value={routeForm.smsRecipients}
                    onChange={(event) =>
                      setRouteForm((current) => ({
                        ...current,
                        smsRecipients: event.target.value,
                      }))
                    }
                    placeholder="+2348000000000"
                    className="mt-3"
                  />
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                <Checkbox
                  className="mt-1"
                  checked={routeForm.notifySlack}
                  onCheckedChange={(checked) =>
                    setRouteForm((current) => ({ ...current, notifySlack: checked as boolean }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Slack notifications</p>
                  <Input
                    value={routeForm.slackWebhookUrl}
                    onChange={(event) =>
                      setRouteForm((current) => ({
                        ...current,
                        slackWebhookUrl: event.target.value,
                      }))
                    }
                    placeholder="https://hooks.slack.com/..."
                    className="mt-3"
                  />
                </div>
              </label>

              <div className="space-y-2">
                <Label htmlFor="subjectTemplate">Subject template</Label>
                <Textarea
                  id="subjectTemplate"
                  value={routeForm.subjectTemplate}
                  onChange={(event) =>
                    setRouteForm((current) => ({
                      ...current,
                      subjectTemplate: event.target.value,
                    }))
                  }
                  placeholder="Leave blank to use default template"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emailBodyTemplate">Email body template</Label>
                <Textarea
                  id="emailBodyTemplate"
                  value={routeForm.emailBodyTemplate}
                  onChange={(event) =>
                    setRouteForm((current) => ({
                      ...current,
                      emailBodyTemplate: event.target.value,
                    }))
                  }
                  placeholder="Optional Handlebars HTML"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="smsBodyTemplate">SMS body template</Label>
                <Textarea
                  id="smsBodyTemplate"
                  value={routeForm.smsBodyTemplate}
                  onChange={(event) =>
                    setRouteForm((current) => ({
                      ...current,
                      smsBodyTemplate: event.target.value,
                    }))
                  }
                  placeholder="Optional Handlebars SMS"
                />
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  className="w-full"
                  disabled={routeMutation.isPending || (!selectedRoute && !routeForm.eventKey)}
                  onClick={() => {
                    setRouteMessage(null);
                    setRouteError(null);
                    routeMutation.mutate();
                  }}
                >
                  {routeMutation.isPending
                    ? 'Saving...'
                    : selectedRoute
                      ? 'Save route'
                      : 'Create route'}
                </Button>
                <Button variant="ghost" className="w-full" onClick={beginCreateRoute}>
                  Clear form
                </Button>
                {selectedRoute ? (
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      setRouteMessage(null);
                      setRouteError(null);
                      deleteMutation.mutate(selectedRoute.id);
                    }}
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete route'}
                  </Button>
                ) : null}
              </div>

              {routeMessage ? <p className="text-sm text-emerald-700">{routeMessage}</p> : null}
              {routeError ? <p className="text-sm text-red-700">{routeError}</p> : null}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[1.75rem] border-border shadow-none">
          <CardHeader>
            <CardTitle>Broadcast email</CardTitle>
            <CardDescription>
              Preview audience size first, then queue a sanitized HTML broadcast to verified users.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="audience">Audience</Label>
                <Select
                  value={broadcastForm.audience}
                  onValueChange={(val) =>
                    setBroadcastForm((current) => ({
                      ...current,
                      audience: val as AdminEmailAudience,
                    }))
                  }
                >
                  <SelectTrigger id="audience" className="h-11 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VERIFIED_CUSTOMERS">Verified customers</SelectItem>
                    <SelectItem value="VERIFIED_ORGANIZERS">Verified organizers</SelectItem>
                    <SelectItem value="VERIFIED_CUSTOMERS_AND_ORGANIZERS">
                      Verified customers and organizers
                    </SelectItem>
                    <SelectItem value="USER_IDS">Explicit user IDs</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {broadcastForm.audience === 'USER_IDS' ? (
                <div className="space-y-2">
                  <Label htmlFor="userIds">User IDs</Label>
                  <Textarea
                    id="userIds"
                    value={broadcastForm.userIds}
                    onChange={(event) =>
                      setBroadcastForm((current) => ({ ...current, userIds: event.target.value }))
                    }
                    placeholder="UUID per line"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="broadcastSubject">Subject</Label>
                <Input
                  id="broadcastSubject"
                  value={broadcastForm.subject}
                  onChange={(event) =>
                    setBroadcastForm((current) => ({ ...current, subject: event.target.value }))
                  }
                  placeholder="e.g. Shipping delay update"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="htmlBody">HTML body</Label>
                <Textarea
                  id="htmlBody"
                  value={broadcastForm.htmlBody}
                  onChange={(event) =>
                    setBroadcastForm((current) => ({ ...current, htmlBody: event.target.value }))
                  }
                  className="min-h-56"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={broadcastMutation.isPending || !broadcastForm.subject.trim()}
                  onClick={() => {
                    setBroadcastError(null);
                    setBroadcastMessage(null);
                    broadcastMutation.mutate(true);
                  }}
                >
                  {broadcastMutation.isPending ? 'Working...' : 'Preview audience'}
                </Button>
                <Button
                  className="flex-1"
                  disabled={broadcastMutation.isPending || !broadcastForm.subject.trim()}
                  onClick={() => {
                    setBroadcastError(null);
                    setBroadcastMessage(null);
                    broadcastMutation.mutate(false);
                  }}
                >
                  {broadcastMutation.isPending ? 'Working...' : 'Queue broadcast'}
                </Button>
              </div>

              {broadcastMessage ? (
                <p className="text-sm text-emerald-700">{broadcastMessage}</p>
              ) : null}
              {broadcastError ? <p className="text-sm text-red-700">{broadcastError}</p> : null}
            </div>

            <div className="space-y-4 rounded-3xl border border-border bg-muted/20 p-6">
              <div>
                <p className="text-sm font-semibold text-foreground">Broadcast notes</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The API sanitizes HTML and enforces recipient caps before queueing outbox rows.
                </p>
              </div>

              {broadcastResult ? (
                <div className="space-y-3">
                  <p className="text-sm text-foreground">
                    Recipient count: <strong>{broadcastResult.recipientCount}</strong>
                  </p>
                  {broadcastResult.dryRun ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-foreground">Sample emails</p>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {broadcastResult.sampleEmails.map((email) => (
                          <li key={email}>{email}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Queued outbox rows: {broadcastResult.queued}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Run a preview to inspect audience size before sending.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
