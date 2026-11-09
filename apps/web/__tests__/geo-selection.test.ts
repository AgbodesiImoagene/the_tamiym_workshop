/**
 * TTW-087: the fundraiser checkout offers states and LGAs as lists. These pure
 * helpers decide which state is selected and what a state change resets.
 */
import { findSelectedState, stateFormPatch, type GeoState } from '@/lib/geo';

const states: GeoState[] = [
  { code: 'LA', name: 'Lagos' },
  { code: 'OG', name: 'Ogun' },
];

describe('findSelectedState', () => {
  it('prefers the saved state code', () => {
    expect(findSelectedState(states, 'OG', 'Lagos')).toEqual(states[1]);
  });

  it('matches the saved state text by name when there is no code, ignoring case and spaces', () => {
    expect(findSelectedState(states, '', '  lagos ')).toEqual(states[0]);
  });

  it('finds nothing for a text that is not in the list', () => {
    expect(findSelectedState(states, '', 'Lagoss')).toBeUndefined();
  });

  it('finds nothing for a code that is not in the list', () => {
    expect(findSelectedState(states, 'ZZ', 'Lagos')).toBeUndefined();
  });

  it('finds nothing while the list has not loaded', () => {
    expect(findSelectedState(undefined, 'LA', 'Lagos')).toBeUndefined();
  });

  it('finds nothing for an empty form', () => {
    expect(findSelectedState(states, '', '')).toBeUndefined();
  });
});

describe('stateFormPatch', () => {
  it('sets the state name and code and clears the LGA', () => {
    expect(stateFormPatch(states, 'OG')).toEqual({ state: 'Ogun', stateCode: 'OG', lgaId: '' });
  });

  it('clears everything when no state is chosen', () => {
    expect(stateFormPatch(states, '')).toEqual({ state: '', stateCode: '', lgaId: '' });
  });
});
