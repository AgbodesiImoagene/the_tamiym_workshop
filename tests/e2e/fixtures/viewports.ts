import type { ViewportSize } from '@playwright/test';

export type ViewportProfile = {
  name: string;
  viewport: ViewportSize;
  isMobile?: boolean;
  hasTouch?: boolean;
};

/** Representative desktop, tablet, and mobile profiles for responsive UAT. */
export const VIEWPORT_MATRIX: ViewportProfile[] = [
  { name: 'desktop-1440', viewport: { width: 1440, height: 900 } },
  { name: 'tablet-834', viewport: { width: 834, height: 1194 }, isMobile: true, hasTouch: true },
  {
    name: 'mobile-393',
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  },
];
