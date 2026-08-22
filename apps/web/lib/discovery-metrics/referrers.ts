import type { ReferrerClass } from './types';

const ORGANIC_SEARCH_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'bing.com',
  'www.bing.com',
  'duckduckgo.com',
  'www.duckduckgo.com',
  'search.yahoo.com',
  'yahoo.com',
  'www.yahoo.com',
  'ecosia.org',
  'www.ecosia.org',
]);

const GENERATIVE_REFERRAL_HOSTS = new Set([
  'chatgpt.com',
  'chat.openai.com',
  'perplexity.ai',
  'www.perplexity.ai',
  'claude.ai',
  'www.claude.ai',
  'copilot.microsoft.com',
  'gemini.google.com',
  'you.com',
  'www.you.com',
  'phind.com',
  'www.phind.com',
]);

const SOCIAL_REFERRAL_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'instagram.com',
  'www.instagram.com',
  'twitter.com',
  'www.twitter.com',
  'x.com',
  'www.x.com',
  'linkedin.com',
  'www.linkedin.com',
  'tiktok.com',
  'www.tiktok.com',
  'youtube.com',
  'www.youtube.com',
]);

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase();
}

export function classifyReferrerHost(hostname: string | null | undefined): ReferrerClass {
  if (!hostname?.trim()) {
    return 'direct';
  }

  const host = normalizeHost(hostname);

  if (ORGANIC_SEARCH_HOSTS.has(host)) {
    return 'organic_search';
  }
  if (GENERATIVE_REFERRAL_HOSTS.has(host)) {
    return 'generative_referral';
  }
  if (SOCIAL_REFERRAL_HOSTS.has(host)) {
    return 'social_referral';
  }

  return 'referral';
}

export function extractReferrerHost(referrer: string | null | undefined): string | undefined {
  if (!referrer?.trim()) {
    return undefined;
  }

  try {
    return normalizeHost(new URL(referrer).hostname);
  } catch {
    return undefined;
  }
}

export function classifyDocumentReferrer(
  referrer: string | null | undefined,
  currentOrigin?: string
): ReferrerClass {
  const host = extractReferrerHost(referrer);
  if (!host) {
    return 'direct';
  }

  if (currentOrigin) {
    try {
      const currentHost = normalizeHost(new URL(currentOrigin).hostname);
      if (host === currentHost) {
        return 'direct';
      }
    } catch {
      // Fall through to host classification.
    }
  }

  return classifyReferrerHost(host);
}
