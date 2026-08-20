import { shouldAutorunBullProcessors } from '../runtime/api-role';

/** Shared BullMQ worker options for Nest @Processor decorators. */
export const bullProcessorOptions = {
  // Test: keep workers from blocking Jest open-handle / teardown.
  // Production roles: only worker-capable processes consume queues (TTW-063).
  autorun: shouldAutorunBullProcessors(),
} as const;
