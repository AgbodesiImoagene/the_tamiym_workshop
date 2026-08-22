/** Basic bot/crawler user-agent filter for client-side discovery events. */

const BOT_UA_PATTERNS = [
  /bot\b/i,
  /crawler/i,
  /spider/i,
  /headless/i,
  /lighthouse/i,
  /pagespeed/i,
  /preview/i,
  /slurp/i,
  /bingpreview/i,
  /googlebot/i,
  /gptbot/i,
  /chatgpt-user/i,
];

export function isLikelyBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent?.trim()) {
    return true;
  }

  return BOT_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}
