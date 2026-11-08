import { CurrencyCode, PayoutMode } from '@tamiym/types';
import { z } from 'zod';
import type { SiteSettings, UpdateSiteSettingsInput } from './dashboard';

export const VAT_RATE_ERROR =
  'Enter a VAT rate between 0 and 100, with at most 2 decimals, before saving.';

/** Plain decimal with at most 2 decimals (the stored precision, Decimal(5,4)), checked on the text to avoid float error. */
const VAT_PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

/**
 * The admin site settings form (TTW-183). Input is what the fields hold;
 * output is the `PATCH /admin/site-settings` body, so every check and
 * conversion lives here.
 *
 * The VAT rate is required, from 0 to 100 with at most 2 decimals: an empty
 * field is refused rather than saved as 0 % (TTW-084). The payout fields keep
 * their previous behaviour: no client-side check, the API validates them.
 */
export const siteSettingsFormSchema = z
  .object({
    vatRatePercent: z
      .string()
      .trim()
      .regex(VAT_PERCENT_PATTERN, VAT_RATE_ERROR)
      .refine((percent) => Number(percent) <= 100, VAT_RATE_ERROR),
    pricesIncludeVat: z.boolean(),
    vatAppliesToShipping: z.boolean(),
    currency: z.enum(CurrencyCode),
    payoutMode: z.enum(PayoutMode),
    payoutCadenceDays: z.string(),
    payoutSettlementHoldDays: z.string(),
    minimumPayoutAmount: z.string(),
    autoRetryFailedPayouts: z.boolean(),
  })
  .transform(
    (form): UpdateSiteSettingsInput => ({
      // toFixed keeps the fraction at 4 decimals (7.55 -> 0.0755, not 0.07550000000000001).
      vatRate: Number((Number(form.vatRatePercent) / 100).toFixed(4)),
      pricesIncludeVat: form.pricesIncludeVat,
      vatAppliesToShipping: form.vatAppliesToShipping,
      currency: form.currency,
      payoutMode: form.payoutMode,
      payoutCadenceDays: Number(form.payoutCadenceDays),
      payoutSettlementHoldDays: Number(form.payoutSettlementHoldDays),
      minimumPayoutAmount:
        form.minimumPayoutAmount.trim() === '' ? null : Number(form.minimumPayoutAmount),
      autoRetryFailedPayouts: form.autoRetryFailedPayouts,
    })
  );

export type SiteSettingsFormValues = z.input<typeof siteSettingsFormSchema>;

export const defaultSiteSettingsForm: SiteSettingsFormValues = {
  // Empty until settings load, never a placeholder 0% (TTW-084).
  vatRatePercent: '',
  pricesIncludeVat: true,
  vatAppliesToShipping: true,
  currency: CurrencyCode.NGN,
  payoutMode: PayoutMode.MANUAL,
  payoutCadenceDays: '7',
  payoutSettlementHoldDays: '7',
  minimumPayoutAmount: '',
  autoRetryFailedPayouts: true,
};

export function toSiteSettingsForm(settings: SiteSettings): SiteSettingsFormValues {
  return {
    // TTW-084: an unset rate stays empty so it is never saved back as 0%.
    vatRatePercent:
      settings.vatRate == null ? '' : String(Number((Number(settings.vatRate) * 100).toFixed(2))),
    pricesIncludeVat: settings.pricesIncludeVat,
    vatAppliesToShipping: settings.vatAppliesToShipping,
    currency: settings.currency as CurrencyCode,
    payoutMode: settings.payoutMode as PayoutMode,
    payoutCadenceDays: String(settings.payoutCadenceDays),
    payoutSettlementHoldDays: String(settings.payoutSettlementHoldDays),
    minimumPayoutAmount:
      settings.minimumPayoutAmount != null ? String(settings.minimumPayoutAmount) : '',
    autoRetryFailedPayouts: settings.autoRetryFailedPayouts,
  };
}
