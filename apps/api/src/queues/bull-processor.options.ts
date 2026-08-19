/** Shared BullMQ worker options for Nest @Processor decorators. */
export const bullProcessorOptions = {
  // Keep workers from blocking Jest open-handle / teardown under e2e.
  autorun: process.env.NODE_ENV !== 'test',
} as const;
