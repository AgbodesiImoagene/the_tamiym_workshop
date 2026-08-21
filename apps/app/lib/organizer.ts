import { apiClient } from './api';

export type OrganizerEligibilityGap =
  | 'NOT_CUSTOMER'
  | 'NOT_ACTIVE'
  | 'EMAIL_UNVERIFIED'
  | 'MISSING_FIRST_NAME'
  | 'MISSING_LAST_NAME'
  | 'MISSING_PHONE'
  | 'ALREADY_ORGANIZER';

export type OrganizerApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';

export interface OrganizerApplication {
  id: string;
  organisationName: string;
  intendedUse: string;
  termsVersion: string;
  termsAcceptedAt: string;
  status: OrganizerApplicationStatus;
  customerVisibleReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizerEligibilityResponse {
  eligible: boolean;
  gaps: OrganizerEligibilityGap[];
  termsVersion: string;
  actionableGuidance: string[];
  pendingApplication: OrganizerApplication | null;
  latestApplication: OrganizerApplication | null;
  isOrganizer: boolean;
}

export interface SubmitOrganizerApplicationInput {
  organisationName: string;
  intendedUse: string;
  termsVersion: string;
  termsAcceptedAt: string;
}

export async function getOrganizerEligibility() {
  return apiClient.get<OrganizerEligibilityResponse>('/organiser/applications/eligibility');
}

export async function submitOrganizerApplication(input: SubmitOrganizerApplicationInput) {
  return apiClient.post<OrganizerApplication>('/organiser/applications', input);
}

export async function withdrawOrganizerApplication(applicationId: string) {
  return apiClient.post<OrganizerApplication>(`/organiser/applications/${applicationId}/withdraw`);
}

export async function createDraftCampaign(input: { title: string; description?: string }) {
  return apiClient.post<{ id: string; status: string; title: string; slug?: string }>(
    '/campaigns',
    input
  );
}
