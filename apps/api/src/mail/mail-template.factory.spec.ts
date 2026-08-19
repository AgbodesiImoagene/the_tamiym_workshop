import {
  buildMailTemplateOptions,
  buildMailerModuleOptions,
} from './mail-template.factory';

describe('buildMailTemplateOptions', () => {
  const previousEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousEnv;
  });

  it('uses a stub adapter under NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    const template = await buildMailTemplateOptions('/tmp/ttw-mail-templates');
    expect(template.dir).toBe('/tmp/ttw-mail-templates');
    const compile = (
      template.adapter as { compile: () => () => Promise<string> }
    ).compile();
    await expect(compile()).resolves.toContain('e2e test template stub');
  });

  it('loads HandlebarsAdapter outside test', async () => {
    process.env.NODE_ENV = 'development';
    const template = await buildMailTemplateOptions('/tmp/ttw-mail-templates');
    expect(template.adapter?.constructor?.name).toMatch(/Handlebars/i);
  });
});

describe('buildMailerModuleOptions', () => {
  it('builds transport defaults and template options', async () => {
    process.env.NODE_ENV = 'test';
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'MAIL_USER') return 'user';
        if (key === 'MAIL_PASSWORD') return 'pass';
        return fallback;
      }),
    };
    const options = await buildMailerModuleOptions(config as never);
    expect(options.transport.host).toBe('localhost');
    expect(options.transport.auth).toEqual({ user: 'user', pass: 'pass' });
    expect(options.template).toBeDefined();
  });
});
