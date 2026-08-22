import type { JsonLdObject } from '@/lib/structured-data/builders';
import { serializeJsonLd } from '@/lib/structured-data/builders';

interface JsonLdProps {
  data: JsonLdObject | JsonLdObject[];
}

/** Renders safe server-side JSON-LD for approved public templates. */
export function JsonLd({ data }: JsonLdProps) {
  const payload = Array.isArray(data) ? data : [data];
  if (payload.length === 0) {
    return null;
  }

  const serialized = payload.length === 1 ? serializeJsonLd(payload[0]) : serializeJsonLd(payload);

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialized }} />;
}
