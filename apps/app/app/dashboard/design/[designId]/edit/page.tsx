import { notFound } from 'next/navigation';
import WorkshopEditor from '@/components/workshop/WorkshopEditor';
import { getDesign, getProductWorkshop } from '@/lib/designs';

interface EditDesignPageProps {
  params: Promise<{ designId: string }>;
}

export default async function EditDesignPage({ params }: EditDesignPageProps) {
  const { designId } = await params;

  let design;
  try {
    design = await getDesign(designId);
  } catch {
    notFound();
  }

  if (!design) notFound();

  let workshopContext;
  try {
    workshopContext = await getProductWorkshop(design.productId);
  } catch {
    notFound();
  }

  if (!workshopContext) notFound();

  return <WorkshopEditor workshopContext={workshopContext} existingDesign={design} />;
}
