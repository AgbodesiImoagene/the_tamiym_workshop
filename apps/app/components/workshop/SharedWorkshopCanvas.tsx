'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';

const WorkshopCanvas = dynamic(
  () => import('@/components/workshop/WorkshopCanvas'),
  { ssr: false },
);

export type SharedWorkshopCanvasProps = ComponentProps<typeof WorkshopCanvas>;

/** Client-only canvas wrapper so the shared design page can remain a Server Component. */
export function SharedWorkshopCanvas(props: SharedWorkshopCanvasProps) {
  return <WorkshopCanvas {...props} />;
}
