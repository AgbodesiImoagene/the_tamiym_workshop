'use client';

import { customerAssets } from '@/lib/assets';
import { Input, Label, Textarea } from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  changePassword,
  getUserAddresses,
  getUserProfile,
  updateUserProfile,
  upsertPrimaryAddress,
} from '@/lib/profile';

interface CustomerSettingsFormProps {
  pageTitle: string;
  personalTitle: string;
  passwordTitle: string;
  shippingTitle: string;
}

interface ProfileFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface AddressFormValues {
  country: string;
  state: string;
  city: string;
  addressLine1: string;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[32px] border border-black/20 bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.15)] lg:p-8">
      <div className="border-b border-black/10 pb-4">
        <h2 className="text-[20px] font-bold text-black/90">{title}</h2>
      </div>
      <div className="pt-6">{children}</div>
    </section>
  );
}

function SaveButton({ label, loading }: { label: string; loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="h-8 min-w-[178px] rounded-lg border border-black/50 bg-accent px-4 text-sm font-bold text-[#004385] disabled:opacity-60"
    >
      {loading ? 'Saving...' : label}
    </button>
  );
}

export function CustomerSettingsForm({
  pageTitle,
  personalTitle,
  passwordTitle,
  shippingTitle,
}: CustomerSettingsFormProps) {
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: getUserProfile,
  });

  const addressesQuery = useQuery({
    queryKey: ['user-addresses'],
    queryFn: getUserAddresses,
  });

  const profileForm = useForm<ProfileFormValues>({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const addressForm = useForm<AddressFormValues>({
    defaultValues: {
      country: 'Nigeria',
      state: '',
      city: '',
      addressLine1: '',
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      profileForm.reset({
        firstName: profileQuery.data.firstName ?? '',
        lastName: profileQuery.data.lastName ?? '',
        email: profileQuery.data.email ?? '',
        phone: profileQuery.data.phone ?? '',
      });
    }
  }, [profileForm, profileQuery.data]);

  useEffect(() => {
    const primary =
      addressesQuery.data?.find((address) => address.isDefault) ?? addressesQuery.data?.[0];
    if (primary) {
      addressForm.reset({
        country: primary.country ?? 'Nigeria',
        state: primary.state ?? '',
        city: primary.city ?? '',
        addressLine1: primary.addressLine1 ?? '',
      });
    }
  }, [addressForm, addressesQuery.data]);

  const profileMutation = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      passwordForm.reset();
    },
  });

  const addressMutation = useMutation({
    mutationFn: upsertPrimaryAddress,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-addresses'] });
    },
  });

  return (
    <div className="mt-10 space-y-8 lg:mt-0">
      <div className="flex items-center gap-3">
        <button type="button" className="rounded-full p-1 text-black">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-[32px] font-bold tracking-[-0.02em] text-black/90">{pageTitle}</h1>
      </div>

      <SectionCard title={personalTitle}>
        <form
          className="space-y-8"
          onSubmit={profileForm.handleSubmit(async (values) => {
            await profileMutation.mutateAsync({
              firstName: values.firstName,
              lastName: values.lastName,
              phone: values.phone,
            });
          })}
        >
          <div className="flex flex-col items-center gap-4">
            <Image
              src={customerAssets.settingsProfilePhoto}
              alt="Profile"
              width={220}
              height={220}
              className="h-[220px] w-[220px] rounded-full object-cover"
            />
            <button
              type="button"
              className="h-8 rounded-lg border border-black/50 bg-accent px-4 text-sm font-bold text-[#004385]"
            >
              {pageTitle === 'Profile' ? 'Upload Profile Picture' : 'Update Profile Picture'}
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-[20px] font-bold text-black">
                First Name
              </Label>
              <Input
                id="firstName"
                placeholder="Enter name"
                {...profileForm.register('firstName')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-[20px] font-bold text-black">
                Surname
              </Label>
              <Input id="lastName" placeholder="Enter name" {...profileForm.register('lastName')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-[20px] font-bold text-black">
              Email
            </Label>
            <Input id="email" disabled {...profileForm.register('email')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-[20px] font-bold text-black">
              Phone
            </Label>
            <Input id="phone" placeholder="Enter number" {...profileForm.register('phone')} />
          </div>

          <SaveButton label="Save" loading={profileMutation.isPending} />
        </form>
      </SectionCard>

      <SectionCard title={passwordTitle}>
        <form
          className="space-y-8"
          onSubmit={passwordForm.handleSubmit(async (values) => {
            if (values.newPassword !== values.confirmPassword) {
              passwordForm.setError('confirmPassword', {
                type: 'validate',
                message: 'Passwords must match',
              });
              return;
            }

            await passwordMutation.mutateAsync({
              currentPassword: values.currentPassword,
              newPassword: values.newPassword,
            });
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="currentPassword" className="text-[20px] font-bold text-black">
              {pageTitle === 'Profile' ? 'Create Password' : 'Previous Password'}
            </Label>
            <Input
              id="currentPassword"
              type="password"
              placeholder="********************"
              {...passwordForm.register('currentPassword')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword" className="text-[20px] font-bold text-black">
              {pageTitle === 'Profile' ? 'Confirm Password' : 'New Password'}
            </Label>
            <Input
              id="newPassword"
              type="password"
              placeholder="********************"
              {...passwordForm.register('newPassword')}
            />
          </div>

          {pageTitle !== 'Profile' ? (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-[20px] font-bold text-black">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="********************"
                {...passwordForm.register('confirmPassword')}
              />
            </div>
          ) : null}

          <SaveButton label="Save" loading={passwordMutation.isPending} />
        </form>
      </SectionCard>

      <SectionCard title={shippingTitle}>
        <form
          className="space-y-8"
          onSubmit={addressForm.handleSubmit(async (values) => {
            await addressMutation.mutateAsync({
              country: values.country,
              state: values.state,
              city: values.city,
              addressLine1: values.addressLine1,
            });
          })}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country" className="text-[20px] font-bold text-black">
                Select Country
              </Label>
              <Input
                id="country"
                placeholder="Enter country"
                {...addressForm.register('country')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state" className="text-[20px] font-bold text-black">
                Select State/City
              </Label>
              <Input id="state" placeholder="Enter state" {...addressForm.register('state')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="city" className="text-[20px] font-bold text-black">
              City
            </Label>
            <Input id="city" placeholder="Enter city" {...addressForm.register('city')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="addressLine1" className="text-[20px] font-bold text-black">
              Street Address
            </Label>
            <Textarea
              id="addressLine1"
              placeholder="Enter address"
              {...addressForm.register('addressLine1')}
            />
          </div>

          <SaveButton label="Save" loading={addressMutation.isPending} />
        </form>
      </SectionCard>
    </div>
  );
}
