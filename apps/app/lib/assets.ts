export const customerAssets = {
  sidebarIllustration: '/assets/customer/sidebar-illustration.svg',
  mobileHeaderLogo: '/assets/customer/mobile-header-logo.png',
  desktopFooterLogo: '/assets/customer/desktop-footer-logo.png',
  profileIcon: '/assets/customer/profile-icon.svg',
  tutorialVideoOne: '/assets/customer/tutorial-video-one.jpg',
  tutorialVideoTwo: '/assets/customer/tutorial-video-two.png',
  emptyCartIllustration: '/assets/customer/sidebar-illustration.svg',
  productFallbacks: [
    '/assets/customer/product-fallback-1.jpg',
    '/assets/customer/product-fallback-2.png',
    '/assets/customer/product-fallback-3.jpg',
    '/assets/customer/product-fallback-4.jpg',
    '/assets/customer/product-fallback-5.jpg',
    '/assets/customer/product-fallback-6.jpg',
  ],
} as const;

/**
 * Placeholder for a product without a photo. Picked from the product id so the list card
 * and the product page show the same one (a list position would differ between the two).
 */
export function productFallbackImage(productId: string): string {
  let hash = 0;
  for (const char of productId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return customerAssets.productFallbacks[hash % customerAssets.productFallbacks.length];
}
