import { ACCEPTED_LAYER_FIELDS } from '../designs/design-content.validator';
import {
  SNAPSHOT_DROPPED_FIELDS,
  SNAPSHOT_KEPT_FIELDS,
} from './order-item-design-snapshot';

/**
 * TTW-101: a layer that the save-time check accepts must not lose a field of the print
 * silently. The first two reviews each found one (the type `IText`, then `fontStyle`). Every
 * field the validator accepts is either kept by the frozen copy or dropped on purpose, and
 * the two lists below name each decision. Adding a field to the validator breaks this test
 * until someone decides.
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
      // `text` is not a validator field name on images, and `designAssetId` is read from
      // `data`, so these two are the only names allowed beyond the validator's own.
      const extra = [
        ...SNAPSHOT_KEPT_FIELDS[kind],
        ...SNAPSHOT_DROPPED_FIELDS[kind],
      ].filter((field) => !accepted.has(field));
      expect(extra).toEqual([]);
    },
  );
});
