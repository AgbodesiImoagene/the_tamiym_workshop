import Link from 'next/link';
import type { BreadcrumbItem } from '@/lib/content/types';

interface MarketingBreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function MarketingBreadcrumbs({ items }: MarketingBreadcrumbsProps) {
  if (items.length <= 1) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="mx-auto max-w-7xl px-6 pt-6 lg:px-8">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-tamiym-blue/80">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.href}-${item.label}`} className="inline-flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden className="text-black/30">
                  /
                </span>
              ) : null}
              {isLast ? (
                <span aria-current="page" className="font-semibold text-tamiym-blue">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="font-medium hover:underline">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
