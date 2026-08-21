'use client';

import { CustomerDashboardShell, formatCurrency } from '@/components/customer-dashboard-shell';
import { authApi, ApiError, User } from '@/lib/auth';
import {
  addCampaignOffer,
  getCampaignDraftPreview,
  getCampaignOwnerDetail,
  getCampaignPriceGuidance,
  removeCampaignOffer,
  submitCampaignForReview,
  updateCampaignBasics,
  updateCampaignOffer,
} from '@/lib/campaign-authoring';
import { getMyDesigns, Design } from '@/lib/designs';
import { getDashboardProducts, DashboardProduct } from '@/lib/products';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

function errorMessage(err: unknown): string {
  const apiError = err as ApiError;
  if (apiError.blockers?.length) {
    return apiError.blockers.map((b) => `${b.code}: ${b.message}`).join(' · ');
  }
  if (apiError.code) {
    return `${apiError.code}: ${apiError.message}`;
  }
  return apiError.message || 'Something went wrong';
}

type BasicsValues = {
  title: string;
  slug: string;
  description: string;
  story: string;
  goalAmount: string;
  startDate: string;
  endDate: string;
};

function BasicsEditor({
  initial,
  disabled,
  saving,
  onSave,
}: {
  initial: BasicsValues;
  disabled: boolean;
  saving: boolean;
  onSave: (values: BasicsValues) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [description, setDescription] = useState(initial.description);
  const [story, setStory] = useState(initial.story);
  const [goalAmount, setGoalAmount] = useState(initial.goalAmount);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);

  return (
    <section className="space-y-4 rounded-[32px] border border-black/20 bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.15)]">
      <h2 className="text-[22px] font-bold text-black/90">Basics</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-black/70">Title</span>
          <input
            className="h-12 w-full rounded-xl border border-black/20 px-4 outline-none disabled:opacity-60"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-black/70">Slug</span>
          <input
            className="h-12 w-full rounded-xl border border-black/20 px-4 outline-none disabled:opacity-60"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-black/70">Short description</span>
          <textarea
            className="min-h-20 w-full rounded-xl border border-black/20 px-4 py-3 outline-none disabled:opacity-60"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="text-black/70">Story</span>
          <textarea
            className="min-h-28 w-full rounded-xl border border-black/20 px-4 py-3 outline-none disabled:opacity-60"
            value={story}
            onChange={(e) => setStory(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-black/70">Goal (NGN)</span>
          <input
            type="number"
            min={0}
            className="h-12 w-full rounded-xl border border-black/20 px-4 outline-none disabled:opacity-60"
            value={goalAmount}
            onChange={(e) => setGoalAmount(e.target.value)}
            disabled={disabled}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-black/70">Start</span>
            <input
              type="date"
              className="h-12 w-full rounded-xl border border-black/20 px-4 outline-none disabled:opacity-60"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-black/70">End</span>
            <input
              type="date"
              className="h-12 w-full rounded-xl border border-black/20 px-4 outline-none disabled:opacity-60"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={disabled}
            />
          </label>
        </div>
      </div>
      {!disabled ? (
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onSave({
              title,
              slug,
              description,
              story,
              goalAmount,
              startDate,
              endDate,
            })
          }
          className="h-11 rounded-lg border border-black/50 bg-accent px-5 text-sm font-bold text-[#004385] disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save basics'}
        </button>
      ) : (
        <p className="text-sm text-black/60">Editing is locked after submission.</p>
      )}
    </section>
  );
}

export default function CampaignAuthoringPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);

  const [productId, setProductId] = useState('');
  const [designId, setDesignId] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          router.push('/auth/login');
        } else {
          setBootError(apiError.message || 'Failed to load user data');
        }
      }
    };
    void fetchUser();
  }, [router]);

  const detailQuery = useQuery({
    queryKey: ['campaign-authoring', campaignId],
    queryFn: () => getCampaignOwnerDetail(campaignId),
    enabled: !!user && !!campaignId,
  });

  const productsQuery = useQuery({
    queryKey: ['campaign-authoring-products'],
    queryFn: getDashboardProducts,
    enabled: !!user,
  });

  const designsQuery = useQuery({
    queryKey: ['campaign-authoring-designs'],
    queryFn: getMyDesigns,
    enabled: !!user,
  });

  const detail = detailQuery.data;
  const isDraft = detail?.status === 'DRAFT';
  const revision = detail?.draftRevision ?? 1;

  const designsForProduct: Design[] = useMemo(() => {
    const all = designsQuery.data ?? [];
    if (!productId) return all;
    return all.filter((d) => d.productId === productId);
  }, [designsQuery.data, productId]);

  const guidanceQuery = useQuery({
    queryKey: ['campaign-price-guidance', campaignId, productId, designId],
    queryFn: () => getCampaignPriceGuidance(campaignId, productId, designId),
    enabled: !!user && !!productId && !!designId && isDraft,
  });

  const previewQuery = useQuery({
    queryKey: ['campaign-draft-preview', campaignId],
    queryFn: () => getCampaignDraftPreview(campaignId),
    enabled: previewOpen && !!user,
  });

  async function handleMutationError(err: unknown) {
    const apiError = err as ApiError;
    if (apiError.statusCode === 409 || apiError.code === 'CAMPAIGN_STALE_REVISION') {
      setStaleNotice(
        'This draft changed elsewhere. Reloading the latest version — re-apply your edits and save again.',
      );
      await queryClient.invalidateQueries({ queryKey: ['campaign-authoring', campaignId] });
      return;
    }
    setFormError(errorMessage(err));
  }

  const saveBasics = useMutation({
    mutationFn: (values: BasicsValues) =>
      updateCampaignBasics(campaignId, {
        expectedRevision: revision,
        title: values.title.trim(),
        slug: values.slug.trim(),
        description: values.description.trim() || null,
        story: values.story.trim() || null,
        goalAmount: values.goalAmount.trim() ? Number(values.goalAmount) : null,
        startDate: values.startDate
          ? new Date(values.startDate).toISOString()
          : null,
        endDate: values.endDate
          ? new Date(`${values.endDate}T23:59:59.000Z`).toISOString()
          : null,
      }),
    onSuccess: async (data) => {
      setFormError(null);
      setStaleNotice(null);
      queryClient.setQueryData(['campaign-authoring', campaignId], data);
    },
    onError: (err) => {
      void handleMutationError(err);
    },
  });

  const addOffer = useMutation({
    mutationFn: () =>
      addCampaignOffer(campaignId, {
        expectedRevision: revision,
        productId,
        designId,
        price: Number(offerPrice),
      }),
    onSuccess: async (data) => {
      setFormError(null);
      setStaleNotice(null);
      setOfferPrice('');
      queryClient.setQueryData(['campaign-authoring', campaignId], data);
    },
    onError: (err) => {
      void handleMutationError(err);
    },
  });

  const removeOffer = useMutation({
    mutationFn: (offerId: string) =>
      removeCampaignOffer(campaignId, offerId, { expectedRevision: revision }),
    onSuccess: async (data) => {
      setConfirmRemoveId(null);
      setFormError(null);
      queryClient.setQueryData(['campaign-authoring', campaignId], data);
    },
    onError: (err) => {
      void handleMutationError(err);
    },
  });

  const updateOfferPrice = useMutation({
    mutationFn: (args: { offerId: string; price: number }) =>
      updateCampaignOffer(campaignId, args.offerId, {
        expectedRevision: revision,
        price: args.price,
      }),
    onSuccess: async (data) => {
      setFormError(null);
      queryClient.setQueryData(['campaign-authoring', campaignId], data);
    },
    onError: (err) => {
      void handleMutationError(err);
    },
  });

  const submitReview = useMutation({
    mutationFn: () => submitCampaignForReview(campaignId),
    onSuccess: async (data) => {
      setConfirmSubmit(false);
      setFormError(null);
      queryClient.setQueryData(['campaign-authoring', campaignId], data);
    },
    onError: (err) => {
      void handleMutationError(err);
    },
  });

  if (bootError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-red-700">{bootError}</p>
      </div>
    );
  }

  return (
    <CustomerDashboardShell
      activeNav="fundraiser"
      displayName={user?.firstName || user?.email?.split('@')[0] || 'Organiser'}
    >
      <div className="mt-10 space-y-8 lg:mt-0" data-testid="campaign-authoring-editor">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Link href="/dashboard/fundraiser" className="text-sm text-[#004385] underline">
              ← Back to fundraisers
            </Link>
            <h1 className="text-[32px] font-bold tracking-[-0.02em] text-black/90">
              Campaign editor
            </h1>
            <p className="max-w-2xl text-sm text-black/65">
              Explicit-save DRAFT workspace. Saves require the current revision (
              {revision}). Artwork changes happen in the{' '}
              <Link href="/dashboard/design" className="underline">
                workshop
              </Link>
              .
            </p>
          </div>
          {detail ? (
            <span className="rounded-full bg-[#cfddf8] px-3 py-1 text-xs font-medium text-[#004385]">
              {detail.status.replaceAll('_', ' ')} · rev {detail.draftRevision}
            </span>
          ) : null}
        </div>

        {staleNotice ? (
          <p className="rounded-2xl bg-[#fff4d6] px-4 py-4 text-sm text-[#7a5a00]" role="alert">
            {staleNotice}
          </p>
        ) : null}
        {formError ? (
          <p className="rounded-2xl bg-[#fdecec] px-4 py-4 text-sm text-[#8a1f1f]" role="alert">
            {formError}
          </p>
        ) : null}
        {detail?.rejectionReason ? (
          <p className="rounded-2xl bg-[#fdecec] px-4 py-4 text-sm text-[#8a1f1f]">
            Previous review feedback: {detail.rejectionReason}
          </p>
        ) : null}

        {detailQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading campaign…</p>
        ) : detailQuery.isError ? (
          <p className="text-sm text-red-700">
            {errorMessage(detailQuery.error)}. This campaign may be missing or not yours.
          </p>
        ) : detail ? (
          <>
            <BasicsEditor
              key={`${detail.id}-${detail.draftRevision}`}
              disabled={!isDraft}
              saving={saveBasics.isPending}
              initial={{
                title: detail.title ?? '',
                slug: detail.slug ?? '',
                description: detail.description ?? '',
                story: detail.story ?? '',
                goalAmount:
                  detail.goalAmount != null && detail.goalAmount > 0
                    ? String(detail.goalAmount)
                    : '',
                startDate: detail.startDate ? detail.startDate.slice(0, 10) : '',
                endDate: detail.endDate ? detail.endDate.slice(0, 10) : '',
              }}
              onSave={(values) => {
                setFormError(null);
                void saveBasics.mutateAsync(values);
              }}
            />

            <section className="space-y-4 rounded-[32px] border border-black/20 bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.15)]">
              <h2 className="text-[22px] font-bold text-black/90">Offers</h2>
              <p className="text-sm text-black/65">
                Each offer needs a product, an owned matching design, and a selling price at or
                above the platform minimum. Pending moderation is allowed while drafting.
              </p>

              <div className="space-y-3">
                {(detail.offers ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No offers yet.</p>
                ) : (
                  detail.offers.map((offer) => (
                    <article
                      key={offer.id}
                      className="rounded-2xl border border-black/10 px-4 py-4"
                      data-testid="campaign-offer-row"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-black">{offer.product.name}</p>
                          <p className="text-sm text-black/60">
                            Design: {offer.design?.name ?? 'Missing'} ·{' '}
                            {offer.design?.moderationStatus ?? 'n/a'}
                          </p>
                          <p className="mt-1 text-sm text-black/70">
                            Price:{' '}
                            {offer.price != null
                              ? formatCurrency(offer.price, offer.currency)
                              : '—'}{' '}
                            (min {formatCurrency(offer.minimumPrice, offer.currency)})
                          </p>
                          <p className="mt-1 text-xs text-black/50">{offer.priceGuidance}</p>
                        </div>
                        {isDraft ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="h-9 rounded-lg border border-black/30 px-3 text-xs font-semibold"
                              onClick={() => {
                                const next = window.prompt(
                                  'New selling price (NGN)',
                                  String(offer.price ?? offer.minimumPrice),
                                );
                                if (!next) return;
                                const price = Number(next);
                                if (!Number.isFinite(price)) return;
                                setFormError(null);
                                void updateOfferPrice.mutateAsync({
                                  offerId: offer.id,
                                  price,
                                });
                              }}
                            >
                              Update price
                            </button>
                            <button
                              type="button"
                              className="h-9 rounded-lg border border-red-300 px-3 text-xs font-semibold text-red-800"
                              onClick={() => setConfirmRemoveId(offer.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))
                )}
              </div>

              {isDraft ? (
                <div className="grid gap-3 border-t border-black/10 pt-4 md:grid-cols-4">
                  <label className="space-y-1 text-sm md:col-span-1">
                    <span className="text-black/70">Product</span>
                    <select
                      className="h-12 w-full rounded-xl border border-black/20 px-3"
                      value={productId}
                      onChange={(e) => {
                        setProductId(e.target.value);
                        setDesignId('');
                      }}
                    >
                      <option value="">Select product</option>
                      {(productsQuery.data as DashboardProduct[] | undefined)?.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm md:col-span-1">
                    <span className="text-black/70">Design</span>
                    <select
                      className="h-12 w-full rounded-xl border border-black/20 px-3"
                      value={designId}
                      onChange={(e) => setDesignId(e.target.value)}
                    >
                      <option value="">Select design</option>
                      {designsForProduct.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.moderationStatus})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm md:col-span-1">
                    <span className="text-black/70">Price (NGN)</span>
                    <input
                      type="number"
                      min={0}
                      className="h-12 w-full rounded-xl border border-black/20 px-4"
                      value={offerPrice}
                      onChange={(e) => setOfferPrice(e.target.value)}
                      placeholder={
                        guidanceQuery.data
                          ? `Min ${guidanceQuery.data.minimumPrice}`
                          : 'Selling price'
                      }
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={
                        addOffer.isPending || !productId || !designId || !offerPrice
                      }
                      onClick={() => {
                        setFormError(null);
                        void addOffer.mutateAsync();
                      }}
                      className="h-12 w-full rounded-lg border border-black/50 bg-accent px-4 text-sm font-bold text-[#004385] disabled:opacity-60"
                    >
                      {addOffer.isPending ? 'Adding…' : 'Add offer'}
                    </button>
                  </div>
                  {guidanceQuery.data ? (
                    <p className="text-xs text-black/55 md:col-span-4">
                      {guidanceQuery.data.guidance} Minimum:{' '}
                      {formatCurrency(
                        guidanceQuery.data.minimumPrice,
                        guidanceQuery.data.currency,
                      )}
                      .
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="flex flex-wrap gap-3">
              <button
                type="button"
                className="h-11 rounded-lg border border-black/40 px-5 text-sm font-semibold"
                onClick={() => setPreviewOpen(true)}
                data-testid="campaign-preview-open"
              >
                Preview draft
              </button>
              {isDraft ? (
                <button
                  type="button"
                  className="h-11 rounded-lg border border-black/50 bg-accent px-5 text-sm font-bold text-[#004385]"
                  onClick={() => setConfirmSubmit(true)}
                  data-testid="campaign-submit-open"
                >
                  Submit for review
                </button>
              ) : null}
            </section>
          </>
        ) : null}

        {confirmRemoveId ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6">
              <h3 className="text-lg font-bold">Remove this offer?</h3>
              <p className="text-sm text-black/65">
                This deletes the product/design/price row from the draft. You can add it again
                later.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="h-10 rounded-lg border px-4 text-sm"
                  onClick={() => setConfirmRemoveId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-10 rounded-lg border border-red-400 bg-red-50 px-4 text-sm font-semibold text-red-800"
                  disabled={removeOffer.isPending}
                  onClick={() => void removeOffer.mutateAsync(confirmRemoveId)}
                >
                  {removeOffer.isPending ? 'Removing…' : 'Remove offer'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {confirmSubmit ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6">
              <h3 className="text-lg font-bold">Submit for review?</h3>
              <p className="text-sm text-black/65">
                Editing locks while the campaign is in review. Save all changes first. Server
                blocker codes will explain anything still missing.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="h-10 rounded-lg border px-4 text-sm"
                  onClick={() => setConfirmSubmit(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-10 rounded-lg border border-black/50 bg-accent px-4 text-sm font-bold text-[#004385]"
                  disabled={submitReview.isPending}
                  onClick={() => void submitReview.mutateAsync()}
                  data-testid="campaign-submit-confirm"
                >
                  {submitReview.isPending ? 'Submitting…' : 'Confirm submit'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {previewOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold">Draft preview</h3>
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={() => setPreviewOpen(false)}
                >
                  Close
                </button>
              </div>
              <p className="mb-4 inline-block rounded bg-[#fff4d6] px-3 py-1 text-xs font-semibold text-[#7a5a00]">
                DRAFT · not purchasable
              </p>
              {previewQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading preview…</p>
              ) : previewQuery.isError ? (
                <p className="text-sm text-red-700">{errorMessage(previewQuery.error)}</p>
              ) : (
                <pre className="overflow-auto rounded-xl bg-black/5 p-4 text-xs">
                  {JSON.stringify(previewQuery.data, null, 2)}
                </pre>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </CustomerDashboardShell>
  );
}
