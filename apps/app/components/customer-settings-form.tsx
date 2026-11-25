'use client';

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
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DELIVERY_INSTRUCTIONS_MAX_LENGTH, instructionsPayload } from '@/lib/delivery-instructions';
import { ProfilePictureField } from '@/components/profile-picture-field';
import { canGoBack } from '@/lib/can-go-back';
import {
  DEFAULT_PHONE_COUNTRY,
  digitsOnly,
  phoneCountryOptions,
  splitStoredPhone,
  toE164,
} from '@/lib/phone';
import type { CountryCode } from 'libphonenumber-js/max';
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
  /** Label of the picture button ("Upload Profile Picture" or "Update Profile Picture"). No picture block without it. */
  pictureButtonLabel?: string;
  personalTitle: string;
  passwordTitle: string;
  shippingTitle: string;
}

interface ProfileFormValues {
  firstName: string;
  lastName: string;
  email: string;
  /** National digits only; the country is `phoneCountry`. */
  phone: string;
  phoneCountry: string;
}

interface PasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// TTW-192: the state is chosen from the list (TTW-087), so a form without a state code
// cannot be saved.
const STATE_NOT_LISTED_MESSAGE = 'Choose a state from the list.';

// TTW-264: the phone is a country (calling code) and digits only. The international number
// the API wants is built on save; an empty phone means "no phone" and is not sent.
const PHONE_INVALID_MESSAGE = 'Enter a valid phone number for the selected country.';

const profileSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string(),
    phoneCountry: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.phone && !toE164(values.phoneCountry as CountryCode, values.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: PHONE_INVALID_MESSAGE });
    }
  });

function profileSaveMessage(error: unknown): string {
  const raw = (error as { message?: unknown } | null)?.message;
  const message = Array.isArray(raw) ? raw.join(' ') : typeof raw === 'string' ? raw : '';
  if (/phone/i.test(message)) return PHONE_INVALID_MESSAGE;
  return message || 'We could not save your details.';
}

const addressSchema = z.object({
  country: z.string(),
  state: z.string(),
  stateCode: z.string().min(1, STATE_NOT_LISTED_MESSAGE),
  lgaId: z.string(),
  city: z.string(),
  addressLine1: z.string(),
  // TTW-198: optional, plain text. Same limit as the API.
  instructions: z.string().max(DELIVERY_INSTRUCTIONS_MAX_LENGTH, 'Use at most 500 characters.'),
});

type AddressFormValues = z.infer<typeof addressSchema>;

const selectClassName =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm';

// The country selector is a fixed-width column next to the phone field. `selectClassName` is
// full width, which would make it fill the whole line.
const phoneSelectClassName = selectClassName.replace('w-full', 'w-[150px] shrink-0 sm:w-[190px]');

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
  pictureButtonLabel,
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
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      phoneCountry: DEFAULT_PHONE_COUNTRY,
    },
  });

  const phoneCountry = useWatch({ control: profileForm.control, name: 'phoneCountry' });

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
      instructions: '',
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
      const stored = splitStoredPhone(profileQuery.data.phone);
      profileForm.reset({
        firstName: profileQuery.data.firstName ?? '',
        lastName: profileQuery.data.lastName ?? '',
        email: profileQuery.data.email ?? '',
        phone: stored.digits,
        phoneCountry: stored.country,
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
      instructions: primaryAddress.instructions ?? '',
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

  const router = useRouter();

  // TTW-229: go back in the history; a page opened directly has no previous page of this
  // site, so fall back to the dashboard.
  const goBack = () => {
    if (canGoBack()) router.back();
    else router.push('/dashboard');
  };

  const addressMutation = useMutation({
    mutationFn: upsertPrimaryAddress,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-addresses'] });
    },
  });

  return (
    <div className="mt-10 space-y-8 lg:mt-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Go back"
          onClick={goBack}
          className="rounded-full p-1 text-black"
        >
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
        {/* Figma: the picture sits inside this card, centred under the title. */}
        {pictureButtonLabel ? <ProfilePictureField buttonLabel={pictureButtonLabel} /> : null}
        <FormProvider {...profileForm}>
          <form
            className="space-y-8"
            onSubmit={profileForm.handleSubmit(async (values) => {
              try {
                await profileMutation.mutateAsync({
                  firstName: values.firstName,
                  lastName: values.lastName,
                  // An empty phone is "none": the API refuses an empty string.
                  ...(values.phone
                    ? { phone: toE164(values.phoneCountry as CountryCode, values.phone)! }
                    : {}),
                });
              } catch {
                // Shown under the form below; nothing is left unhandled.
              }
            })}
          >
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
                  <div className="flex gap-2">
                    <select
                      aria-label="Country calling code"
                      className={phoneSelectClassName}
                      value={phoneCountry}
                      onChange={(event) =>
                        profileForm.setValue('phoneCountry', event.target.value, {
                          shouldDirty: true,
                        })
                      }
                    >
                      {phoneCountryOptions().map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.name} (+{option.callingCode})
                        </option>
                      ))}
                    </select>
                    <FormControl>
                      <Input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={15}
                        placeholder="8012345678"
                        className="min-w-0 flex-1"
                        {...field}
                        onChange={(event) => field.onChange(digitsOnly(event.target.value))}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {profileMutation.isError ? (
              <p role="alert" className="text-sm text-red-700">
                {profileSaveMessage(profileMutation.error)}
              </p>
            ) : null}
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
                ...instructionsPayload(values.instructions, primaryAddress?.instructions),
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
                            : 'Select an LGA'}
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

            <FormField
              control={addressForm.control}
              name="instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClassName}>Delivery instructions</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional, for example: ring twice, or leave with the guard"
                      maxLength={DELIVERY_INSTRUCTIONS_MAX_LENGTH}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* TTW-221: a refused save (for example no LGA) must be visible. */}
            {addressMutation.isError ? (
              <p role="alert" className="text-sm text-red-700">
                {(addressMutation.error as { message?: string }).message ||
                  'We could not save your address.'}
              </p>
            ) : null}
            <SaveButton label="Save" loading={addressMutation.isPending} />
          </form>
        </FormProvider>
      </SectionCard>
    </div>
  );
}
