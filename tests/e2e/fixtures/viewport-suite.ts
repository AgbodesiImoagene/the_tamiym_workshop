import { test as base } from './test';
import { VIEWPORT_MATRIX, type ViewportProfile } from './viewports';

type ViewportFixtures = {
  viewportProfile: ViewportProfile;
};

/**
 * Runs the enclosing describe block once per viewport in VIEWPORT_MATRIX.
 */
export function describeViewportMatrix(title: string, fn: () => void): void {
  for (const profile of VIEWPORT_MATRIX) {
    base.describe(`${title} @viewport:${profile.name}`, () => {
      base.use({
        viewport: profile.viewport,
        isMobile: profile.isMobile ?? false,
        hasTouch: profile.hasTouch ?? false,
      });
      fn();
    });
  }
}

export { base as viewportTest };
