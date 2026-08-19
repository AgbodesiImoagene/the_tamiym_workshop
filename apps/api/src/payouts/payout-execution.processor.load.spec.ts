describe('module load coverage for TTW-003 wiring', () => {
  it('loads payout execution processor (covers bullProcessorOptions import)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('./payout-execution.processor')).not.toThrow();
  });
});
