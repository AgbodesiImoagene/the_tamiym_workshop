import { ACCEPTED_LAYER_FIELDS } from '../designs/design-content.validator';
import {
  SNAPSHOT_DROPPED_FIELDS,
  SNAPSHOT_KEPT_FIELDS,
  buildDesignSnapshot,
} from './order-item-design-snapshot';

/**
 * TTW-101: a layer that the save-time check accepts must not lose a field of the print
 * silently. The first two reviews each found one (the type `IText`, then `fontStyle`). Every
 * field the validator accepts is either kept by the frozen copy or dropped on purpose, and
 * the two lists name each decision. Adding a field to the validator breaks this test until
 * someone decides, and a field listed as kept must really come out of the copy.
 */
describe('frozen design: every accepted layer field has a decision (TTW-101)', () => {
  it.each(['text', 'image'] as const)(
    'decides every field of a %s layer, once',
    (kind) => {
      const kept = SNAPSHOT_KEPT_FIELDS[kind];
      const dropped = SNAPSHOT_DROPPED_FIELDS[kind];

      const undecided = ACCEPTED_LAYER_FIELDS[kind].filter(
        (field) => !kept.includes(field) && !dropped.includes(field),
      );
      expect(undecided).toEqual([]);

      const both = kept.filter((field) => dropped.includes(field));
      expect(both).toEqual([]);
    },
  );

  it.each(['text', 'image'] as const)(
    'names no field of a %s layer that the validator does not accept',
    (kind) => {
      const accepted = new Set(ACCEPTED_LAYER_FIELDS[kind]);
      // Every name in both lists must be one the validator accepts on that kind of layer.
      const extra = [
        ...SNAPSHOT_KEPT_FIELDS[kind],
        ...SNAPSHOT_DROPPED_FIELDS[kind],
      ].filter((field) => !accepted.has(field));
      expect(extra).toEqual([]);
    },
  );
});

/**
 * A value that is not the default, for every field listed as kept. A new kept field needs a
 * sample here, so the list cannot name a field the code does not copy.
 */
const SAMPLES: Record<string, unknown> = {
  originX: 'center',
  originY: 'bottom',
  left: 11,
  top: 12,
  width: 13,
  height: 14,
  scaleX: 1.5,
  scaleY: 2.5,
  angle: 33,
  flipX: true,
  flipY: true,
  skewX: 7,
  skewY: 8,
  opacity: 0.25,
  fill: '#010203',
  stroke: '#040506',
  strokeWidth: 9,
  backgroundColor: '#070809',
  text: 'Sample',
  fontFamily: 'Georgia',
  fontSize: 31,
  fontWeight: 'bold',
  fontStyle: 'italic',
  textAlign: 'right',
  lineHeight: 1.7,
  charSpacing: 55,
  underline: true,
  overline: true,
  linethrough: true,
  textBackgroundColor: '#0a0b0c',
  cropX: 15,
  cropY: 16,
};

describe('frozen design: every kept field is really copied (TTW-101)', () => {
  const productViews = [
    {
      id: 'pv-front',
      key: 'front',
      displayName: 'Front',
      sortOrder: 0,
      printArea: null,
    },
  ];
  const layerTypes = { text: 'IText', image: 'Image' } as const;

  it.each(['text', 'image'] as const)(
    'copies every kept field of a %s layer with its value',
    (kind) => {
      // `visible` is applied (a hidden layer is skipped), not copied: see below.
      const fields = SNAPSHOT_KEPT_FIELDS[kind].filter((f) => f !== 'visible');
      const withoutSample = fields.filter((f) => !(f in SAMPLES));
      expect(withoutSample).toEqual([]);

      const layer: Record<string, unknown> = {
        type: layerTypes[kind],
        ...(kind === 'image' ? { data: { designAssetId: 'da-1' } } : {}),
      };
      for (const field of fields) layer[field] = SAMPLES[field];

      const snapshot = buildDesignSnapshot(
        {
          id: 'd',
          name: 'n',
          productId: 'p',
          designData: {
            views: {
              front: {
                productViewId: 'pv-front',
                fabricJson: { objects: [layer] },
              },
            },
          },
        },
        productViews,
        new Date('2026-11-22T10:00:00.000Z'),
      );

      const copied = snapshot.views[0].layers[0] as unknown as Record<
        string,
        unknown
      >;
      const lost = fields.filter((f) => copied[f] !== SAMPLES[f]);
      expect(lost).toEqual([]);
    },
  );

  it('applies `visible`: a layer set to false is not copied, one set to true is', () => {
    const build = (visible: boolean) =>
      buildDesignSnapshot(
        {
          id: 'd',
          name: 'n',
          productId: 'p',
          designData: {
            views: {
              front: {
                productViewId: 'pv-front',
                fabricJson: {
                  objects: [{ type: 'IText', text: 'T', visible }],
                },
              },
            },
          },
        },
        productViews,
        new Date('2026-11-22T10:00:00.000Z'),
      ).views;
    expect(build(false)).toEqual([]);
    expect(build(true)).toHaveLength(1);
  });
});
