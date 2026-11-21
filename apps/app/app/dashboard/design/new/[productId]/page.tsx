import { notFound } from 'next/navigation';
import WorkshopEditor from '@/components/workshop/WorkshopEditor';
import WorkshopPageShell from '@/components/workshop/WorkshopPageShell';
import { getProductWorkshop } from '@/lib/designs';

interface NewDesignPageProps {
  params: Promise<{ productId: string }>;
}

export default async function NewDesignPage({ params }: NewDesignPageProps) {
  const { productId } = await params;

  let workshopContext;
  try {
    workshopContext = await getProductWorkshop(productId);
  } catch {
    notFound();
  }

  if (!workshopContext) notFound();

  return (
    <WorkshopPageShell>
      <WorkshopEditor workshopContext={workshopContext} />
    </WorkshopPageShell>
  );
}
