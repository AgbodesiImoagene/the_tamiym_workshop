'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isLikelyBotUserAgent } from '@/lib/discovery-metrics/bot-filter';
import {
  canCollectDiscoveryAnalytics,
  readDiscoveryConsent,
} from '@/lib/discovery-metrics/consent';
import { trackDiscoveryEvent } from '@/lib/discovery-metrics/transport';

/**
 * Privacy-safe discovery analytics stub (TTW-077 slice 1).
 * Disabled by default; requires env flag + explicit consent grant.
 */
export function DiscoveryAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!canCollectDiscoveryAnalytics(readDiscoveryConsent())) {
      return;
    }

    if (typeof navigator !== 'undefined' && isLikelyBotUserAgent(navigator.userAgent)) {
      return;
    }

    trackDiscoveryEvent({
      name: 'discovery_page_view',
      path: pathname,
      referrer: typeof document !== 'undefined' ? document.referrer : null,
      currentOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
  }, [pathname]);

  return null;
}
