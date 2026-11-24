import EditDesignLoader from '@/components/workshop/EditDesignLoader';

interface EditDesignPageProps {
  params: Promise<{ designId: string }>;
}

/**
 * The design belongs to the signed-in customer, whose cookie only the browser sends, so the
 * data is loaded by `EditDesignLoader` in the browser (TTW-233). This page fetches nothing.
 */
export default async function EditDesignPage({ params }: EditDesignPageProps) {
  const { designId } = await params;

  return <EditDesignLoader designId={designId} />;
}
