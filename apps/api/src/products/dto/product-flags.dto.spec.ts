import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

/** Same options as the global pipe in `main.ts`. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const targets = [
  {
    name: 'CreateProductDto',
    metatype: CreateProductDto,
    base: { categoryId: 'cat-1', name: 'Classic Tee' },
  },
  { name: 'UpdateProductDto', metatype: UpdateProductDto, base: {} },
] as const;

const flags = ['isBestSeller', 'expressProduction'] as const;

describe.each(targets)(
  'TTW-267: product flags on $name',
  ({ metatype, base }) => {
    const validate = (value: Record<string, unknown>) =>
      pipe.transform(
        { ...base, ...value },
        { type: 'body', metatype },
      ) as Promise<Record<string, unknown>>;

    describe.each(flags)('%s', (flag) => {
      it.each([true, false])('keeps %s', async (value) => {
        await expect(validate({ [flag]: value })).resolves.toMatchObject({
          [flag]: value,
        });
      });

      it('stays absent when it is not sent', async () => {
        const dto = await validate({});
        expect(dto[flag]).toBeUndefined();
      });

      // Implicit conversion would otherwise turn "false" into true.
      it.each(['false', 'true', '', 0, 1, null])(
        'refuses %j',
        async (value) => {
          await expect(validate({ [flag]: value })).rejects.toThrow(
            BadRequestException,
          );
        },
      );
    });
  },
);
