/** Common apparel / merch placements; only missing keys are created when using “add standard views”. */
export const STANDARD_PRODUCT_VIEW_PRESETS: ReadonlyArray<{
  key: string;
  displayName: string;
}> = [
  { key: 'front', displayName: 'Front' },
  { key: 'back', displayName: 'Back' },
  { key: 'left_sleeve', displayName: 'Left sleeve' },
  { key: 'right_sleeve', displayName: 'Right sleeve' },
];
