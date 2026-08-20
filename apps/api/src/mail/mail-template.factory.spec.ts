import {
  buildMailTemplateRenderer,
  buildMailTransportConfig,
  createMailTransporter,
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

describe('buildMailTemplateRenderer', () => {
  const previousEnv = process.env.NODE_ENV;
  const fs = require('node:fs') as typeof import('node:fs');
  const os = require('node:os') as typeof import('node:os');
  const path = require('node:path') as typeof import('node:path');

  afterEach(() => {
    process.env.NODE_ENV = previousEnv;
  });

  it('uses a stub renderer under NODE_ENV=test', () => {
    process.env.NODE_ENV = 'test';
    const renderer = buildMailTemplateRenderer('/tmp/ttw-mail-templates');
    expect(renderer.render('verification', {})).toContain(
      'e2e test template stub',
    );
  });

  it('compiles Handlebars templates outside test', () => {
    process.env.NODE_ENV = 'development';
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttw-mail-'));
    const partials = path.join(dir, 'partials');
    fs.mkdirSync(partials);
    fs.writeFileSync(path.join(partials, 'header.hbs'), '<header>H</header>');
    fs.writeFileSync(
      path.join(dir, 'hello.hbs'),
      '{{> header}}<p>{{name}}</p>',
    );
    const renderer = buildMailTemplateRenderer(dir);
    expect(renderer.render('hello', { name: 'Ada' })).toContain('Ada');
    expect(renderer.render('hello', { name: 'Ada' })).toContain(
      '<header>H</header>',
    );
  });
});

describe('buildMailTransportConfig', () => {
  it('builds transport defaults with optional auth', () => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'MAIL_USER') return 'user';
        if (key === 'MAIL_PASSWORD') return 'pass';
        return fallback;
      }),
    };
    const options = buildMailTransportConfig(config as never);
    expect(options.host).toBe('localhost');
    expect(options.auth).toEqual({ user: 'user', pass: 'pass' });
    expect(options.from).toContain('Tamiym');
  });
});

describe('createMailTransporter', () => {
  it('creates a nodemailer transport from config', () => {
    const transport = createMailTransporter({
      host: 'localhost',
      port: 1025,
      secure: false,
      from: 'test@example.com',
    });
    expect(transport).toBeDefined();
    expect(typeof transport.sendMail).toBe('function');
    transport.close();
  });
});
