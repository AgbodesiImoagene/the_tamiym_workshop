import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SharedWorkshopCanvas } from '@/components/workshop/SharedWorkshopCanvas';
import { getSharedDesign, getProductWorkshop, type WorkshopView, type DesignData } from '@/lib/designs';

interface SharedDesignPageProps {
  params: Promise<{ shareToken: string }>;
}

export default async function SharedDesignPage({
  params,
}: SharedDesignPageProps) {
  const { shareToken } = await params;

  let design;
  try {
    design = await getSharedDesign(shareToken);
  } catch {
    notFound();
  }

  if (!design) notFound();

  let workshopContext;
  try {
    workshopContext = await getProductWorkshop(design.productId);
  } catch {
    workshopContext = null;
  }

  const views: WorkshopView[] = workshopContext?.views ?? [];
  const designableViews = views.filter((v) => v.isDesignable);
  const designData = design.designData as DesignData;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">{design.name}</h1>
            <p className="text-sm text-zinc-500">{design.product.name}</p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
          >
            Create your own →
          </Link>
        </div>
      </header>

      {/* Canvas per view */}
      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        <p className="text-sm text-zinc-500">
          This is a read-only view of a shared design.
        </p>

        <div className="flex flex-wrap gap-8">
          {designableViews.length === 0 ? (
            /* Fallback: no workshop context, show raw thumbnail */
            design.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={design.thumbnailUrl}
                alt={design.name}
                className="max-w-md rounded-2xl border border-zinc-200 shadow"
              />
            ) : (
              <p className="text-sm text-zinc-500">No preview available.</p>
            )
          ) : (
            designableViews.map((view) => {
              const viewData = designData?.views?.[view.key];
              return (
                <div key={view.key}>
                  <p className="mb-2 text-sm font-medium text-zinc-700">
                    {view.displayName}
                  </p>
                  <SharedWorkshopCanvas
                    viewKey={view.key}
                    printArea={view.printArea}
                    templateLayers={view.templateLayers}
                    activeEffects={[]}
                    fabricJson={viewData?.fabricJson ?? null}
                    readOnly
                  />
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
