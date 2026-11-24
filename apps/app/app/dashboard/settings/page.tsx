'use client';

import { CustomerSettingsForm } from '@/components/customer-settings-form';

export default function DashboardSettingsPage() {
  return (
    <>
      <CustomerSettingsForm
        pageTitle="Settings"
        personalTitle="Update Personal Information"
        passwordTitle="Update Password"
        shippingTitle="Update Shipping Information"
      />
    </>
  );
}
