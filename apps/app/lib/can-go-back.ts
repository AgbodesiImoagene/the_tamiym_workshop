/**
 * TTW-229: is there a previous page of this site to go back to?
 *
 * The Navigation API only counts entries of this site, so a direct visit has none even
 * when the tab held another page before. Browsers without it fall back to the history
 * length, which also counts pages of other sites: there, a customer who arrived from an
 * external link can be sent back to that site.
 */
export function canGoBack(): boolean {
  const navigation = (window as Window & { navigation?: { canGoBack: boolean } }).navigation;
  return navigation ? navigation.canGoBack : window.history.length > 1;
}
