'use client';

import {
  deleteAdminOptionValueUpcharge,
  deleteAdminViewSurcharge,
  getAdminProductSurcharges,
  setAdminOptionValueUpcharge,
  setAdminViewSurcharge,
  type AdminProductDetail,
} from '@/lib/products';
import {
  describeSurchargeError,
  surchargeFormSchema,
  type SurchargeFormValues,
} from '@/lib/surcharge-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

/** Formats a decimal string such as "1000.00" as ₦1,000.00 for display. */
function formatNaira(amount: string): string {
  return `₦${Number(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type SurchargeRowProps = {
  /** Accessible name of the amount field, unique on the page. */
  fieldLabel: string;
  /** What the buttons act on, for screen readers: "Size XXL" or "Back print". */
  subject: string;
  /** Visible name of the thing being priced, such as "XXL" or "Back". */
  name: string;
  /** Saved amount as a decimal string, or null when no surcharge is set. */
  savedAmount: string | null;
  save: (amount: number) => Promise<unknown>;
  remove: () => Promise<unknown>;
  onChanged: () => void;
};

function SurchargeRow({
  fieldLabel,
  subject,
  name,
  savedAmount,
  save,
  remove,
  onChanged,
}: SurchargeRowProps) {
  const [notice, setNotice] = useState<{
    kind: 'saved' | 'removed' | 'error';
    text: string;
  } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SurchargeFormValues>({
    resolver: zodResolver(surchargeFormSchema),
    // `values` re-syncs the field when the saved amount changes after a save or a refresh.
    values: { amount: savedAmount ?? '' },
  });

  const saveMutation = useMutation({
    mutationFn: (values: SurchargeFormValues) => save(Number(values.amount)),
    onSuccess: () => {
      setNotice({ kind: 'saved', text: 'Saved.' });
      onChanged();
    },
    onError: (error: unknown) => setNotice({ kind: 'error', text: describeSurchargeError(error) }),
  });
  const removeMutation = useMutation({
    mutationFn: remove,
    onSuccess: () => {
      setNotice({ kind: 'removed', text: 'Removed.' });
      onChanged();
    },
    onError: (error: unknown) => setNotice({ kind: 'error', text: describeSurchargeError(error) }),
  });

  const busy = saveMutation.isPending || removeMutation.isPending;
  const fieldId = `surcharge-${fieldLabel.replace(/\s+/g, '-').toLowerCase()}`;
  const messageId = `${fieldId}-message`;
  const fieldError = errors.amount?.message;

  return (
    <form
      noValidate
      className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-muted/20 p-3"
      onSubmit={handleSubmit((values) => {
        setNotice(null);
        saveMutation.mutate(values);
      })}
    >
      <div className="min-w-32 flex-1 space-y-1 pt-2">
        <Label htmlFor={fieldId} className="text-sm font-medium">
          {name}
        </Label>
        <p className="text-xs text-muted-foreground">
          {savedAmount === null ? 'No surcharge' : `Current: ${formatNaira(savedAmount)}`}
        </p>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-sm text-muted-foreground">
            ₦
          </span>
          <Input
            id={fieldId}
            aria-label={fieldLabel}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={messageId}
            className="h-10 w-32"
            inputMode="decimal"
            autoComplete="off"
            disabled={busy}
            {...register('amount', { onChange: () => setNotice(null) })}
          />
        </div>
        <p
          id={messageId}
          role={fieldError || notice?.kind === 'error' ? 'alert' : 'status'}
          className={
            fieldError || notice?.kind === 'error'
              ? 'text-xs text-destructive'
              : 'text-xs text-muted-foreground'
          }
        >
          {fieldError ?? notice?.text ?? ''}
        </p>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={busy} aria-label={`Save ${subject} surcharge`}>
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Remove ${subject} surcharge`}
          disabled={busy || savedAmount === null}
          onClick={() => {
            setNotice(null);
            removeMutation.mutate();
          }}
        >
          {removeMutation.isPending ? 'Removing…' : 'Remove'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Size (option value) upcharges and print-side (view) surcharges for one
 * product, in naira (TTW-094). Saved amounts apply to new quotes and orders;
 * existing orders keep the price they were created with.
 */
export function ProductSurchargesPanel({ product }: { product: AdminProductDetail }) {
  const queryClient = useQueryClient();
  const queryKey = ['admin-product-surcharges', product.id];
  const surcharges = useQuery({
    queryKey,
    queryFn: () => getAdminProductSurcharges(product.id),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
  };

  const upchargeFor = (optionId: string, valueId: string) =>
    surcharges.data?.optionValueUpcharges.find(
      (row) => row.optionId === optionId && row.valueId === valueId
    )?.amount ?? null;
  const surchargeFor = (viewId: string) =>
    surcharges.data?.viewSurcharges.find((row) => row.viewId === viewId)?.amount ?? null;

  const optionsWithValues = product.options.filter((option) => option.values.length > 0);

  return (
    <Card className="rounded-[1.75rem] border-border shadow-xs" aria-labelledby="surcharges-title">
      <CardHeader>
        <CardTitle id="surcharges-title">Size and print surcharges</CardTitle>
        <CardDescription>
          Amounts are in naira and are added to the product price. A change applies to new quotes
          and orders only. Existing orders keep the price they were created with.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {surcharges.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading surcharges…</p>
        ) : surcharges.isError ? (
          <div role="alert" className="space-y-3 py-6 text-center">
            <p className="text-sm text-destructive">{describeSurchargeError(surcharges.error)}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void surcharges.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <>
            <section aria-labelledby="option-surcharges-title" className="space-y-3">
              <div>
                <h3 id="option-surcharges-title" className="text-sm font-semibold">
                  Option surcharges
                </h3>
                <p className="text-xs text-muted-foreground">
                  Added to every variant that uses the option value, for example XXL +₦500.
                </p>
              </div>
              {optionsWithValues.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This product has no option values yet. Add a Size option with its values to set
                  size surcharges.
                </p>
              ) : (
                optionsWithValues.map((option) => (
                  <div key={option.id} className="space-y-2">
                    <h4 className="text-sm font-medium">{option.name}</h4>
                    {option.values.map((value) => (
                      <SurchargeRow
                        key={value.id}
                        fieldLabel={`Surcharge for ${option.name} ${value.displayName}`}
                        subject={`${option.name} ${value.displayName}`}
                        name={value.displayName}
                        savedAmount={upchargeFor(option.id, value.id)}
                        save={(amount) =>
                          setAdminOptionValueUpcharge(product.id, option.id, value.id, amount)
                        }
                        remove={() =>
                          deleteAdminOptionValueUpcharge(product.id, option.id, value.id)
                        }
                        onChanged={refresh}
                      />
                    ))}
                  </div>
                ))
              )}
            </section>

            <section aria-labelledby="view-surcharges-title" className="space-y-3">
              <div>
                <h3 id="view-surcharges-title" className="text-sm font-semibold">
                  Print-side surcharges
                </h3>
                <p className="text-xs text-muted-foreground">
                  The first side of a design is free. This amount is charged for each other side
                  that is printed, for example Back +₦1,000. It applies to every variant of the
                  product.
                </p>
              </div>
              {product.views.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This product has no views yet. Add a view below to set a print surcharge.
                </p>
              ) : (
                product.views.map((view) => (
                  <SurchargeRow
                    key={view.id}
                    fieldLabel={`Print surcharge for ${view.displayName}`}
                    subject={`${view.displayName} print`}
                    name={view.displayName}
                    savedAmount={surchargeFor(view.id)}
                    save={(amount) => setAdminViewSurcharge(product.id, view.id, amount)}
                    remove={() => deleteAdminViewSurcharge(product.id, view.id)}
                    onChanged={refresh}
                  />
                ))
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
