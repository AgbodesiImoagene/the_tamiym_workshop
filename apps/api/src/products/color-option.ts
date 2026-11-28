import { BadRequestException } from '@nestjs/common';

/**
 * TTW-266: one definition of "the colour option of a product" and of a valid hex code,
 * shared by the admin writes, the product list card and the data repair.
 */

export const COLOR_CODE = 'color';
const BRITISH_COLOR_CODE = 'colour';

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

/**
 * The code an option is stored with: the British spelling becomes `color`, and the spaces
 * around either spelling are removed. Other codes are left as they are.
 */
export function normalizeOptionCode(code: string): string {
  const trimmed = code.trim();
  const spelling = trimmed.toLowerCase();
  if (spelling === BRITISH_COLOR_CODE) return COLOR_CODE;
  return spelling === COLOR_CODE ? trimmed : code;
}

/** True for both spellings, in any case: rows written before TTW-266 may hold `colour`. */
export function isColorOptionCode(code: string): boolean {
  return normalizeOptionCode(code).toLowerCase() === COLOR_CODE;
}

/**
 * Checks the `metadata` sent for a value of a colour option. `undefined` means "not sent".
 * A colour may have no hex, but a `hex` key that is present must be a valid hex code.
 */
export function assertColorMetadata(metadata: unknown): void {
  if (metadata === undefined) return;
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    throw new BadRequestException(
      'metadata of a color value must be an object',
    );
  }
  if ('hex' in metadata && !isHexColor(metadata.hex)) {
    throw new BadRequestException(
      'metadata.hex must be a hex color code such as #008000',
    );
  }
}
