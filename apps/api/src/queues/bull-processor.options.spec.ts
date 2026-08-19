describe('bullProcessorOptions', () => {
  const previousEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousEnv;
    jest.resetModules();
  });

  it('disables autorun under test', () => {
    process.env.NODE_ENV = 'test';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./bull-processor.options') as {
      bullProcessorOptions: { autorun: boolean };
    };
    expect(mod.bullProcessorOptions.autorun).toBe(false);
  });

  it('enables autorun outside test', () => {
    process.env.NODE_ENV = 'development';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./bull-processor.options') as {
      bullProcessorOptions: { autorun: boolean };
    };
    expect(mod.bullProcessorOptions.autorun).toBe(true);
  });
});
