'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { label: 'Campaigns', href: '/admin/moderation/campaigns' },
  { label: 'Designs', href: '/admin/moderation/designs' },
  { label: 'Media', href: '/admin/moderation/media' },
];

export function ModerationQueueNav() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex w-fit gap-1 rounded-xl bg-gray-100 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={[
            'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
            pathname?.startsWith(tab.href)
              ? 'bg-white text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
