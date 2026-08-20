import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import type { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';

const requireFromHere = createRequire(__filename);

export type CompiledMailTemplate = (context: Record<string, unknown>) => string;

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

function loadHandlebars() {
  // Lazy CJS load: keeps unit/e2e Jest from importing Handlebars at module eval
  // when tests stub templates.
  return requireFromHere('handlebars') as typeof import('handlebars');
}

/**
 * Compile Handlebars templates from disk (partials under `partials/`).
 * Templates already use inline styles — no CSS-inliner dependency.
 */
export function buildMailTemplateRenderer(
  templatesDir = join(__dirname, 'templates'),
): {
  render: (template: string, context: Record<string, unknown>) => string;
} {
  if (process.env.NODE_ENV === 'test') {
    return {
      render: () => '<html><body><!-- e2e test template stub --></body></html>',
    };
  }

  const Handlebars = loadHandlebars();
  Handlebars.registerHelper('formatAmount', formatAmountHelper);

  const partialsDir = join(templatesDir, 'partials');
  try {
    for (const file of readdirSync(partialsDir)) {
      if (!file.endsWith('.hbs')) continue;
      const name = file.replace(/\.hbs$/, '');
      Handlebars.registerPartial(
        name,
        readFileSync(join(partialsDir, file), 'utf8'),
      );
    }
  } catch {
    // partials directory optional in some environments
  }

  const cache = new Map<string, CompiledMailTemplate>();
  return {
    render(template: string, context: Record<string, unknown>) {
      let compiled = cache.get(template);
      if (!compiled) {
        const source = readFileSync(
          join(templatesDir, `${template}.hbs`),
          'utf8',
        );
        compiled = Handlebars.compile(source) as CompiledMailTemplate;
        cache.set(template, compiled);
      }
      return compiled(context);
    },
  };
}

export type MailTransportConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  from: string;
};

/** Nest factory — unit-tested outside the module class. */
export function buildMailTransportConfig(
  config: ConfigService,
): MailTransportConfig {
  return {
    host: config.get<string>('MAIL_HOST', 'localhost'),
    port: config.get<number>('MAIL_PORT', 1025),
    secure: config.get<string>('MAIL_SECURE') === 'true',
    auth:
      config.get<string>('MAIL_USER') && config.get<string>('MAIL_PASSWORD')
        ? {
            user: config.get<string>('MAIL_USER')!,
            pass: config.get<string>('MAIL_PASSWORD')!,
          }
        : undefined,
    from: config.get<string>('MAIL_FROM', '"Tamiym" <noreply@tamiym.com>'),
  };
}

export function createMailTransporter(
  transportConfig: MailTransportConfig,
): Transporter {
  return nodemailer.createTransport({
    host: transportConfig.host,
    port: transportConfig.port,
    secure: transportConfig.secure,
    auth: transportConfig.auth,
  });
}
