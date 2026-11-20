'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ComponentProps } from 'react';
import { rewriteSharedImageSources } from '@/lib/designs';

const WorkshopCanvas = dynamic(() => import('@/components/workshop/WorkshopCanvas'), {
  ssr: false,
});

export type SharedWorkshopCanvasProps = ComponentProps<typeof WorkshopCanvas> & {
  /** Share bearer of the design. Customer images read through it, with no session. */
  shareToken?: string;
};

/** Client-only canvas wrapper so the shared design page can remain a Server Component. */
export function SharedWorkshopCanvas({
  shareToken,
  fabricJson,
  ...props
}: SharedWorkshopCanvasProps) {
  const sharedJson = useMemo(
    () => (shareToken ? rewriteSharedImageSources(fabricJson, shareToken) : fabricJson),
    [fabricJson, shareToken]
  );
  return <WorkshopCanvas {...props} fabricJson={sharedJson} />;
}
