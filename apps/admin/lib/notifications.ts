import { apiClient } from './api';

export interface AdminNotificationEventCatalogItem {
  key: string;
  description: string;
}

export interface AdminNotificationRoute {
  id: string;
  eventKey: string;
  name: string;
  enabled: boolean;
  notifyEmail: boolean;
  emailRecipients: string[];
  notifySms: boolean;
  smsRecipients: string[];
  notifySlack: boolean;
  slackWebhookUrl: string | null;
  subjectTemplate: string | null;
  emailBodyTemplate: string | null;
  smsBodyTemplate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AdminEmailAudience =
  | 'VERIFIED_CUSTOMERS'
  | 'VERIFIED_ORGANIZERS'
  | 'VERIFIED_CUSTOMERS_AND_ORGANIZERS'
  | 'USER_IDS';

export type AdminBroadcastResult =
  | {
      dryRun: true;
      recipientCount: number;
      sampleEmails: string[];
    }
  | {
      dryRun: false;
      recipientCount: number;
      queued: number;
    };

export async function getAdminNotificationEventCatalog() {
  return apiClient.get<AdminNotificationEventCatalogItem[]>('/admin/notification-routes/events');
}

export async function getAdminNotificationRoutes() {
  return apiClient.get<AdminNotificationRoute[]>('/admin/notification-routes');
}

export async function createAdminNotificationRoute(input: {
  eventKey: string;
  name?: string;
  enabled?: boolean;
  notifyEmail?: boolean;
  emailRecipients?: string[];
  notifySms?: boolean;
  smsRecipients?: string[];
  notifySlack?: boolean;
  slackWebhookUrl?: string | null;
  subjectTemplate?: string | null;
  emailBodyTemplate?: string | null;
  smsBodyTemplate?: string | null;
}) {
  return apiClient.post<AdminNotificationRoute>('/admin/notification-routes', input);
}

export async function updateAdminNotificationRoute(
  id: string,
  input: {
    enabled?: boolean;
    notifyEmail?: boolean;
    emailRecipients?: string[];
    notifySms?: boolean;
    smsRecipients?: string[];
    notifySlack?: boolean;
    slackWebhookUrl?: string | null;
    subjectTemplate?: string | null;
    emailBodyTemplate?: string | null;
    smsBodyTemplate?: string | null;
  }
) {
  return apiClient.patch<AdminNotificationRoute>(`/admin/notification-routes/${id}`, input);
}

export async function deleteAdminNotificationRoute(id: string) {
  return apiClient.delete<AdminNotificationRoute>(`/admin/notification-routes/${id}`);
}

export async function sendAdminBroadcastEmail(input: {
  audience: AdminEmailAudience;
  userIds?: string[];
  subject: string;
  htmlBody: string;
  dryRun?: boolean;
}) {
  return apiClient.post<AdminBroadcastResult>('/admin/notifications/email/broadcast', input);
}
