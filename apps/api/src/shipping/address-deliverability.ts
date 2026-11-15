import { addressStateNotDeliverable } from './shipping.errors';

/** What the check reads from an address row loaded with its state and LGA. */
export type DeliverabilityAddress = {
  stateCode?: string | null;
  lgaId?: string | null;
  geoState?: { isActive: boolean } | null;
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
}
