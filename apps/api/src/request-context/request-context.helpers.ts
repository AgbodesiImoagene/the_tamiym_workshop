import { runWithRequestContext } from './request-context.store';

export function runWithSourceContext<T>(
  source: 'WORKER' | 'CRON' | 'SYSTEM' | 'WEBHOOK',
  callback: () => T,
): T {
  return runWithRequestContext({ source }, callback);
}
