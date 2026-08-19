import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { MailerOptions } from '@nestjs-modules/mailer';
import type { ConfigService } from '@nestjs/config';

const requireFromHere = createRequire(__filename);

/** Minimal adapter used in NODE_ENV=test to avoid importing @css-inline (CustomGC). */
class TestMailTemplateAdapter {
  compile() {
    return () =>
      Promise.resolve(
        '<html><body><!-- e2e test template stub --></body></html>',
      );
  }
}

/** Exported for unit coverage of currency formatting edge cases. */
export function formatAmountHelper(amount: unknown, currency: unknown): string {
  const cur =
    typeof currency === 'string' && currency.length > 0 ? currency : 'NGN';
  const n = typeof amount === 'number' ? amount : Number(amount);
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: cur,
    }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `${cur} ${n}`;
  }
}

/**
 * Build Mailer template options. Production uses Handlebars + CSS inlining;
 * tests avoid loading @css-inline so Jest can exit without open handles.
 */
export function buildMailTemplateOptions(
  templatesDir = join(__dirname, 'templates'),
): NonNullable<MailerOptions['template']> {
  if (process.env.NODE_ENV === 'test') {
    return {
      dir: templatesDir,
      adapter: new TestMailTemplateAdapter() as never,
      options: {
        partials: {
          dir: join(templatesDir, 'partials'),
        },
      },
    };
  }

  // Lazy CJS load: keeps unit/e2e Jest from importing @css-inline at module eval time.
  const { HandlebarsAdapter } = requireFromHere(
    '@nestjs-modules/mailer/dist/adapters/handlebars.adapter',
  ) as {
    HandlebarsAdapter: new (
      helpers?: Record<string, unknown>,
      options?: { inlineCssEnabled?: boolean },
    ) => NonNullable<MailerOptions['template']>['adapter'];
  };

  return {
    dir: templatesDir,
    adapter: new HandlebarsAdapter(
      { formatAmount: formatAmountHelper },
      { inlineCssEnabled: true },
    ),
    options: {
      partials: {
        dir: join(templatesDir, 'partials'),
      },
    },
  };
}

/** Nest MailerModule.forRootAsync factory — unit-tested outside the module class. */
export function buildMailerModuleOptions(config: ConfigService) {
  return {
    transport: {
      host: config.get<string>('MAIL_HOST', 'localhost'),
      port: config.get<number>('MAIL_PORT', 1025),
      secure: config.get<string>('MAIL_SECURE') === 'true',
      auth:
        config.get<string>('MAIL_USER') && config.get<string>('MAIL_PASSWORD')
          ? {
              user: config.get<string>('MAIL_USER'),
              pass: config.get<string>('MAIL_PASSWORD'),
            }
          : undefined,
    },
    defaults: {
      from: config.get<string>('MAIL_FROM', '"Tamiym" <noreply@tamiym.com>'),
    },
    template: buildMailTemplateOptions(),
  };
}
