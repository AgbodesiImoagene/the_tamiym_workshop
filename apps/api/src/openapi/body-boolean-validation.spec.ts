import {
  ArgumentMetadata,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Type } from '@nestjs/common/interfaces';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreateAddressDto } from '../addresses/dto/create-address.dto';
import { UpdateAddressDto } from '../addresses/dto/update-address.dto';
import { CreateAdminNotificationRouteDto } from '../admin-notifications/dto/create-admin-notification-route.dto';
import { UpdateAdminNotificationRouteDto } from '../admin-notifications/dto/update-admin-notification-route.dto';
import { AdminBroadcastEmailDto } from '../admin/dto/admin-broadcast-email.dto';
import { CreateShippingRateDto } from '../admin/dto/create-shipping-rate.dto';
import { CreateShippingRuleDto } from '../admin/dto/create-shipping-rule.dto';
import { CreateShippingZoneDto } from '../admin/dto/create-shipping-zone.dto';
import { UpdateShippingRateDto } from '../admin/dto/update-shipping-rate.dto';
import { UpdateShippingRuleDto } from '../admin/dto/update-shipping-rule.dto';
import { UpdateShippingZoneDto } from '../admin/dto/update-shipping-zone.dto';
import { UpdateSiteSettingsDto } from '../admin/dto/update-site-settings.dto';
import { UpdatePayoutProfileDto } from '../fundraising/dto/update-payout-profile.dto';
import { UpdateInventoryDto } from '../inventory/dto/update-inventory.dto';
import {
  NotificationPreferenceItemDto,
  UpdateNotificationPreferencesDto,
} from '../notifications/dto/update-notification-preferences.dto';
import { CreatePrintAreaDto } from '../products/dto/create-print-area.dto';
import { CreateProductViewDto } from '../products/dto/create-product-view.dto';
import { CreateVariantDto } from '../products/dto/create-variant.dto';
import { UpdatePrintAreaDto } from '../products/dto/update-print-area.dto';
import { UpdateProductViewDto } from '../products/dto/update-product-view.dto';
import { UpdateVariantDto } from '../products/dto/update-variant.dto';
import { ProductsQueryDto } from '../products/dto/products-query.dto';
import { configureApiApplication } from './application.factory';

/**
 * TTW-274: every boolean of a request body goes through the global pipe of the
 * running application. Only `true` and `false` may come out as booleans.
 */
function productionPipe(): ValidationPipe {
  let pipe: ValidationPipe | undefined;
  const app = {
    use: () => undefined,
    getHttpAdapter: () => ({ getInstance: () => ({ set: () => undefined }) }),
    useGlobalPipes: (installed: ValidationPipe) => {
      pipe = installed;
    },
    setGlobalPrefix: () => undefined,
  };
  configureApiApplication(app as unknown as INestApplication);
  if (!pipe) throw new Error('The application installs no global pipe');
  return pipe;
}

const BODY_FLAGS: Array<[string, Type<object>, string[]]> = [
  ['CreateVariantDto', CreateVariantDto, ['isAvailable']],
  ['UpdateVariantDto', UpdateVariantDto, ['isAvailable']],
  ['CreateProductViewDto', CreateProductViewDto, ['isDesignable', 'isDefault']],
  ['UpdateProductViewDto', UpdateProductViewDto, ['isDesignable', 'isDefault']],
  ['CreatePrintAreaDto', CreatePrintAreaDto, ['rotationAllowed']],
  ['UpdatePrintAreaDto', UpdatePrintAreaDto, ['rotationAllowed']],
  ['CreateShippingZoneDto', CreateShippingZoneDto, ['isActive']],
  ['UpdateShippingZoneDto', UpdateShippingZoneDto, ['isActive']],
  ['CreateShippingRuleDto', CreateShippingRuleDto, ['isActive']],
  ['UpdateShippingRuleDto', UpdateShippingRuleDto, ['isActive']],
  ['CreateShippingRateDto', CreateShippingRateDto, ['isActive']],
  ['UpdateShippingRateDto', UpdateShippingRateDto, ['isActive']],
  [
    'UpdateSiteSettingsDto',
    UpdateSiteSettingsDto,
    ['pricesIncludeVat', 'vatAppliesToShipping', 'autoRetryFailedPayouts'],
  ],
  ['CreateAddressDto', CreateAddressDto, ['isDefault']],
  ['UpdateAddressDto', UpdateAddressDto, ['isDefault']],
  ['UpdateInventoryDto', UpdateInventoryDto, ['trackInventory', 'isAvailable']],
  ['UpdatePayoutProfileDto', UpdatePayoutProfileDto, ['isDefault']],
  ['AdminBroadcastEmailDto', AdminBroadcastEmailDto, ['dryRun']],
  [
    'CreateAdminNotificationRouteDto',
    CreateAdminNotificationRouteDto,
    ['enabled', 'notifyEmail', 'notifySms', 'notifySlack'],
  ],
  [
    'UpdateAdminNotificationRouteDto',
    UpdateAdminNotificationRouteDto,
    ['enabled', 'notifyEmail', 'notifySms', 'notifySlack'],
  ],
  ['NotificationPreferenceItemDto', NotificationPreferenceItemDto, ['enabled']],
];

/** The only body whose flag must be sent. */
const REQUIRED_FLAG_DTO = 'NotificationPreferenceItemDto';

const CASES = BODY_FLAGS.flatMap(([name, dto, fields]) =>
  fields.map((field) => ({ name, dto, field })),
);

describe('Booleans in request bodies (TTW-274)', () => {
  const pipe = productionPipe();

  /**
   * The other fields of a body are left out on purpose: the pipe then reports
   * them, and the assertions only look at the flag under test.
   */
  const flagErrors = async (
    dto: Type<object>,
    body: Record<string, unknown>,
    field: string,
  ): Promise<string[]> => {
    const metadata: ArgumentMetadata = { type: 'body', metatype: dto };
    try {
      await pipe.transform(body, metadata);
      return [];
    } catch (error) {
      const response = (
        error as { getResponse: () => { message: string[] } }
      ).getResponse();
      return response.message.filter((message) =>
        message.startsWith(`${field} `),
      );
    }
  };

  /** Same options without the validators, to read what the pipe would store. */
  const converted = async (
    dto: Type<object>,
    body: Record<string, unknown>,
    field: string,
  ): Promise<unknown> => {
    const permissive = new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidUnknownValues: false,
      skipMissingProperties: true,
      skipNullProperties: true,
      skipUndefinedProperties: true,
      exceptionFactory: () => new Error('invalid'),
    });
    const metadata: ArgumentMetadata = { type: 'body', metatype: dto };
    try {
      const result = (await permissive.transform(body, metadata)) as Record<
        string,
        unknown
      >;
      return result[field];
    } catch {
      return 'refused';
    }
  };

  describe.each(CASES)('$name.$field', ({ dto, field }) => {
    it.each([true, false])('keeps the boolean %p', async (value) => {
      expect(await flagErrors(dto, { [field]: value }, field)).toEqual([]);
      expect(await converted(dto, { [field]: value }, field)).toBe(value);
    });

    it('does not read the string "false" as true', async () => {
      expect(await converted(dto, { [field]: 'false' }, field)).not.toBe(true);
    });

    it('leaves an absent flag out', async () => {
      expect(await converted(dto, {}, field)).toBeUndefined();
    });

    it.each(['false', 'true', '', 'no', 0, 1, null, {}, []])(
      'refuses %p instead of converting it',
      async (value) => {
        expect(await flagErrors(dto, { [field]: value }, field)).toContain(
          `${field} must be a boolean value`,
        );
      },
    );
  });

  it.each(CASES.filter(({ name }) => name !== REQUIRED_FLAG_DTO))(
    'accepts a body without $name.$field',
    async ({ dto, field }) => {
      expect(await flagErrors(dto, {}, field)).toEqual([]);
    },
  );

  it('refuses a preference sent without "enabled"', async () => {
    expect(
      await flagErrors(NotificationPreferenceItemDto, {}, 'enabled'),
    ).toContain('enabled must be a boolean value');
  });

  describe('notification preferences, nested in their list', () => {
    const body = (enabled: unknown) => ({
      preferences: [{ channel: 'EMAIL', category: 'MARKETING', enabled }],
    });
    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype: UpdateNotificationPreferencesDto,
    };

    it.each([true, false])('keeps the boolean %p', async (enabled) => {
      await expect(
        pipe.transform(body(enabled), metadata),
      ).resolves.toMatchObject(body(enabled));
    });

    it.each(['false', null])('refuses %p', async (enabled) => {
      await expect(
        pipe.transform(body(enabled), metadata),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  /**
   * `@IsBoolean()` alone only sees the converted value, so a new field using it
   * would accept strings again.
   */
  it('has no DTO using a bare @IsBoolean()', () => {
    const sources = join(__dirname, '..');
    const offenders = readdirSync(sources, {
      recursive: true,
      encoding: 'utf8',
    })
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .filter((file) => !file.startsWith('generated'))
      .filter((file) =>
        /@IsBoolean\(/.test(readFileSync(join(sources, file), 'utf8')),
      );

    expect(offenders).toEqual([]);
  });

  /** A query string has no boolean type: the text forms stay accepted. */
  describe.each(['available', 'onSale'])('ProductsQueryDto.%s', (field) => {
    const metadata: ArgumentMetadata = {
      type: 'query',
      metatype: ProductsQueryDto,
    };

    it.each(['true', 'false'])('accepts the query string %p', async (value) => {
      await expect(
        pipe.transform({ [field]: value }, metadata),
      ).resolves.toBeInstanceOf(ProductsQueryDto);
    });

    it.each([
      ['true', true],
      ['false', false],
    ])('reads %p as %p', async (value, expected) => {
      await expect(
        pipe.transform({ [field]: value }, metadata),
      ).resolves.toMatchObject({ [field]: expected });
    });

    it.each(['0', '1', '', 'no', ['true', 'false']])(
      'refuses %p',
      async (value) => {
        await expect(
          pipe.transform({ [field]: value }, metadata),
        ).rejects.toMatchObject({ status: 400 });
      },
    );

    it('leaves an absent filter out', async () => {
      const query = (await pipe.transform({}, metadata)) as ProductsQueryDto;
      expect(query[field as 'available' | 'onSale']).toBeUndefined();
    });
  });
});
