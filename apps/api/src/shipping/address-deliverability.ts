import {
  addressLgaRequired,
  addressStateNotDeliverable,
} from './shipping.errors';

/** What the check reads from an address row loaded with its state and LGA. */
export type DeliverabilityAddress = {
  countryCode?: string | null;
  stateCode?: string | null;
  lgaId?: string | null;
  // `lgas` is the state's active LGAs, read with `take: 1` (see
  // `DELIVERABILITY_GEO_STATE_SELECT`): only whether there is one matters.
  geoState?: { isActive: boolean; lgas?: Array<{ id: string }> } | null;
  lga?: { isActive: boolean } | null;
};

/**
 * TTW-217: the one rule for quotes and orders. An address whose state or LGA an
 * admin deactivated after it was saved is not delivered to. Called on the row
 * the quote reads and on the row the order snapshots, so a change of address
 * between the two reads cannot get around it.
 */
export function assertAddressDeliverable(address: DeliverabilityAddress): void {
  if (
    (address.stateCode && address.geoState?.isActive === false) ||
    (address.lgaId && address.lga?.isActive === false)
  ) {
    throw addressStateNotDeliverable();
  }
  // TTW-221: a Nigerian address in a state that has active LGAs needs one. An
  // address saved before the rule, with none, is asked to choose before it is
  // quoted or ordered.
  if (
    address.countryCode === 'NG' &&
    address.stateCode &&
    !address.lgaId &&
    (address.geoState?.lgas?.length ?? 0) > 0
  ) {
    throw addressLgaRequired();
  }
}

/** The state fields the check reads; one shared select for every caller. */
export const DELIVERABILITY_GEO_STATE_SELECT = {
  isActive: true,
  lgas: { where: { isActive: true }, select: { id: true }, take: 1 },
} as const;
