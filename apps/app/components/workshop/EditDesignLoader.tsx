'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import WorkshopEditor from '@/components/workshop/WorkshopEditor';
import { getDesign, getProductWorkshop } from '@/lib/designs';

interface EditDesignLoaderProps {
  designId: string;
}

function statusOf(error: unknown): number | undefined {
  return (error as { statusCode?: number } | null)?.statusCode;
}

/**
 * Loads a saved design and its product workshop in the browser, where the customer's session
 * cookie is sent (a Server Component has no cookie and could not read the design: TTW-233).
 * The editor only reads the design when it mounts, so nothing is kept in the query cache
 * (`gcTime: 0`): reopening a design always shows what is saved now.
 */
export default function EditDesignLoader({ designId }: EditDesignLoaderProps) {
  const router = useRouter();

  const designQuery = useQuery({
    queryKey: ['workshop-design', designId],
    queryFn: () => getDesign(designId),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  const design = designQuery.data;

  const workshopQuery = useQuery({
    queryKey: ['workshop-context', design?.productId],
    queryFn: () => getProductWorkshop(design!.productId),
    enabled: !!design,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });

  const isUnauthorized = statusOf(designQuery.error) === 401;

  useEffect(() => {
    if (isUnauthorized) router.replace('/auth/login');
  }, [isUnauthorized, router]);

  if (design && workshopQuery.data) {
    return <WorkshopEditor workshopContext={workshopQuery.data} existingDesign={design} />;
  }

  // The API answers 404 for a missing design and 403 for another customer's: same screen.
  const designStatus = statusOf(designQuery.error);
  if (designStatus === 404 || designStatus === 403) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold text-zinc-900">Design not found</h1>
        <p className="text-sm text-zinc-600">
          This design does not exist, or it does not belong to your account.
        </p>
        <Link
          href="/dashboard/design"
          className="text-sm font-semibold text-[#004385] underline-offset-4 hover:underline"
        >
          Back to Design Workshop
        </Link>
      </div>
    );
  }

  if (designQuery.isError || workshopQuery.isError) {
    if (isUnauthorized) return null;
    const retry = () => {
      if (designQuery.isError) void designQuery.refetch();
      if (workshopQuery.isError) void workshopQuery.refetch();
    };
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <p role="alert" className="text-sm text-red-700">
          We could not load this design. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <p role="status" className="text-sm text-zinc-600">
        Loading your design…
      </p>
    </div>
  );
}
