'use client';

import { customerAssets } from '@/lib/assets';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormProvider,
  Input,
  Separator,
  Textarea,
} from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getGeoLgas, getGeoStates, matchSavedState } from '@/lib/geo';
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

// TTW-192: the state is chosen from the list (TTW-087), so a form without a state code
// cannot be saved.
const STATE_NOT_LISTED_MESSAGE = 'Choose a state from the list.';

const addressSchema = z.object({
  country: z.string(),
  state: z.string(),
  stateCode: z.string().min(1, STATE_NOT_LISTED_MESSAGE),
  lgaId: z.string(),
  city: z.string(),
  addressLine1: z.string(),
});

type AddressFormValues = z.infer<typeof addressSchema>;

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-[32px] border-black/20 shadow-[0_4px_4px_rgba(0,0,0,0.15)]">
      <CardHeader className="pb-0">
        <CardTitle className="text-[20px] font-bold text-black/90">{title}</CardTitle>
        <Separator className="mt-4" />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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

const labelClassName = 'text-[20px] font-bold text-black';

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
    defaultValues: { firstName: '', lastName: '', email: '', phone: '' },
  });

  const passwordForm = useForm<PasswordFormValues>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const addressForm = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      country: 'Nigeria',
      state: '',
      stateCode: '',
      lgaId: '',
      city: '',
      addressLine1: '',
    },
  });

  // TTW-192: states and LGAs come from our lists, like the checkout.
  const statesQuery = useQuery({
    queryKey: ['geo-states'],
    queryFn: getGeoStates,
    staleTime: 5 * 60 * 1000,
  });
  const states = statesQuery.data;
  const stateCode = useWatch({ control: addressForm.control, name: 'stateCode' });
  const lgaId = useWatch({ control: addressForm.control, name: 'lgaId' });
  const selectedState = useMemo(
    () => (states && stateCode ? states.find((item) => item.code === stateCode) : undefined),
    [states, stateCode]
  );
  const lgasQuery = useQuery({
    queryKey: ['geo-lgas', selectedState?.code],
    queryFn: () => getGeoLgas(selectedState!.code),
    staleTime: 5 * 60 * 1000,
    enabled: !!selectedState,
  });
  const lgas = lgasQuery.data ?? [];

  const primaryAddress =
    addressesQuery.data?.find((address) => address.isDefault) ?? addressesQuery.data?.[0];

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

  // Fill the form from the saved address as soon as it loads. The state is matched to the
  // list in a second step, so a slow or failed list never wipes what the customer typed.
  useEffect(() => {
    if (!primaryAddress) return;
    addressForm.reset({
      country: primaryAddress.country ?? 'Nigeria',
      state: primaryAddress.state ?? '',
      stateCode: '',
      lgaId: '',
      city: primaryAddress.city ?? '',
      addressLine1: primaryAddress.addressLine1 ?? '',
    });
  }, [addressForm, primaryAddress]);

  // Once the list is known, match the saved state to it. A saved state that is not in the
  // list leaves the code empty: the customer must choose one, and the schema blocks Save
  // until then. Only the state fields are set, and not once the customer has chosen.
  useEffect(() => {
    if (!primaryAddress || !states) return;
    if (addressForm.getValues('stateCode')) return;
    const matched = matchSavedState(states, primaryAddress);
    if (matched) {
      addressForm.setValue('state', matched.name);
      addressForm.setValue('stateCode', matched.code);
      addressForm.setValue('lgaId', primaryAddress.lgaId ?? '');
    } else {
      void addressForm.trigger('stateCode');
    }
  }, [addressForm, primaryAddress, states]);

  function selectState(code: string) {
    const next = states?.find((item) => item.code === code);
    addressForm.setValue('state', next?.name ?? '', { shouldDirty: true });
    addressForm.setValue('stateCode', next?.code ?? '', {
      shouldDirty: true,
      shouldValidate: true,
    });
    addressForm.setValue('lgaId', '', { shouldDirty: true });
  }

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

      {/* ── Profile ── */}
      <SectionCard title={personalTitle}>
        <FormProvider {...profileForm}>
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
              <FormField
                control={profileForm.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelClassName}>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelClassName}>Surname</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={profileForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClassName}>Email</FormLabel>
                  <FormControl>
                    <Input disabled {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={profileForm.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClassName}>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SaveButton label="Save" loading={profileMutation.isPending} />
          </form>
        </FormProvider>
      </SectionCard>

      {/* ── Password ── */}
      <SectionCard title={passwordTitle}>
        <FormProvider {...passwordForm}>
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
            <FormField
              control={passwordForm.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClassName}>
                    {pageTitle === 'Profile' ? 'Create Password' : 'Previous Password'}
                  </FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="********************" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={passwordForm.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClassName}>
                    {pageTitle === 'Profile' ? 'Confirm Password' : 'New Password'}
                  </FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="********************" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {pageTitle !== 'Profile' ? (
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelClassName}>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="********************" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <SaveButton label="Save" loading={passwordMutation.isPending} />
          </form>
        </FormProvider>
      </SectionCard>

      {/* ── Shipping address ── */}
      <SectionCard title={shippingTitle}>
        <FormProvider {...addressForm}>
          <form
            className="space-y-8"
            onSubmit={addressForm.handleSubmit(async (values) => {
              await addressMutation.mutateAsync({
                country: values.country,
                state: values.state,
                stateCode: values.stateCode,
                ...(lgasQuery.isSuccess && lgas.some((item) => item.id === values.lgaId)
                  ? { lgaId: values.lgaId }
                  : // TTW-193: an emptied select on an address that had an LGA means "remove it".
                    // A saved LGA the list cannot show is left alone (the value is not empty).
                    values.lgaId === '' && primaryAddress?.lgaId
                    ? { lgaId: null }
                    : {}),
                city: values.city,
                addressLine1: values.addressLine1,
              });
            })}
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <FormField
                control={addressForm.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelClassName}>Select Country</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter country" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addressForm.control}
                name="stateCode"
                render={() => (
                  <FormItem>
                    <FormLabel className={labelClassName}>State</FormLabel>
                    <FormControl>
                      <select
                        value={selectedState?.code ?? ''}
                        onChange={(event) => selectState(event.target.value)}
                        disabled={!states}
                        className={selectClassName}
                      >
                        <option value="">{states ? 'Select a state' : 'Loading states...'}</option>
                        {(states ?? []).map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    {statesQuery.isError ? (
                      <p className="text-sm text-destructive">
                        We could not load the states.{' '}
                        <button
                          type="button"
                          onClick={() => void statesQuery.refetch()}
                          className="font-semibold underline"
                        >
                          Try again
                        </button>
                      </p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={addressForm.control}
              name="lgaId"
              render={() => (
                <FormItem>
                  <FormLabel className={labelClassName}>LGA</FormLabel>
                  <FormControl>
                    <select
                      value={lgas.some((item) => item.id === lgaId) ? lgaId : ''}
                      onChange={(event) =>
                        addressForm.setValue('lgaId', event.target.value, { shouldDirty: true })
                      }
                      disabled={!selectedState || lgasQuery.isLoading}
                      className={selectClassName}
                    >
                      <option value="">
                        {!selectedState
                          ? 'Select a state first'
                          : lgasQuery.isLoading
                            ? 'Loading LGAs...'
                            : 'Select an LGA (optional)'}
                      </option>
                      {lgas.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  {lgasQuery.isError ? (
                    <p className="text-sm text-destructive">
                      We could not load the LGAs.{' '}
                      <button
                        type="button"
                        onClick={() => void lgasQuery.refetch()}
                        className="font-semibold underline"
                      >
                        Try again
                      </button>
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={addressForm.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClassName}>City</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter city" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={addressForm.control}
              name="addressLine1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClassName}>Street Address</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Enter address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SaveButton label="Save" loading={addressMutation.isPending} />
          </form>
        </FormProvider>
      </SectionCard>
    </div>
  );
}
