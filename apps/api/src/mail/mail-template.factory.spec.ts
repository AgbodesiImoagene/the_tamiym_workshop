import {
  buildMailTemplateOptions,
  buildMailerModuleOptions,
  formatAmountHelper,
} from './mail-template.factory';

describe('formatAmountHelper', () => {
  it('formats numeric amounts with a currency code', () => {
    expect(formatAmountHelper(1000, 'NGN')).toMatch(/1,?000/);
  });

  it('defaults missing currency to NGN and coerces string amounts', () => {
    expect(formatAmountHelper('50', '')).toMatch(/50/);
  });

  it('falls back when currency code is invalid', () => {
    expect(formatAmountHelper(12, 'NOT_A_CURRENCY')).toBe('NOT_A_CURRENCY 12');
  });

  it('uses 0 when amount is not finite', () => {
    expect(formatAmountHelper(Number.NaN, 'NGN')).toMatch(/0/);
  });
});

describe('buildMailTemplateOptions', () => {
  const previousEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousEnv;
  });

  it('uses a stub adapter under NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    const template = buildMailTemplateOptions('/tmp/ttw-mail-templates');
    expect(template.dir).toBe('/tmp/ttw-mail-templates');
    const compile = (
      template.adapter as { compile: () => () => Promise<string> }
    ).compile();
    await expect(compile()).resolves.toContain('e2e test template stub');
  });

  it('loads HandlebarsAdapter outside test', () => {
    process.env.NODE_ENV = 'development';
    const template = buildMailTemplateOptions('/tmp/ttw-mail-templates');
    expect(template.adapter?.constructor?.name).toMatch(/Handlebars/i);
  });
});

describe('buildMailerModuleOptions', () => {
  it('builds transport defaults and template options', () => {
    process.env.NODE_ENV = 'test';
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'MAIL_USER') return 'user';
        if (key === 'MAIL_PASSWORD') return 'pass';
        return fallback;
      }),
    };
    const options = buildMailerModuleOptions(config as never);
    expect(options.transport.host).toBe('localhost');
    expect(options.transport.auth).toEqual({ user: 'user', pass: 'pass' });
    expect(options.template).toBeDefined();
  });
});
