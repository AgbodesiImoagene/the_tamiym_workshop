'use client';

import { CustomerSettingsForm } from '@/components/customer-settings-form';

export default function DashboardProfilePage() {
  return (
    <>
      <CustomerSettingsForm
        pageTitle="Profile"
        pictureButtonLabel="Upload Profile Picture"
        personalTitle="Personal Information"
        passwordTitle="Password"
        shippingTitle="Shipping Information"
      />
    </>
  );
}
