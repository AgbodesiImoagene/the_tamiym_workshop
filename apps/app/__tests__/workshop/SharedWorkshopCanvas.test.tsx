import { render, screen } from '@testing-library/react';
import { SharedWorkshopCanvas } from '@/components/workshop/SharedWorkshopCanvas';
import type { FabricJson } from '@/lib/designs';

// Replace the dynamically loaded Fabric canvas by a probe that shows the props it receives.
jest.mock('next/dynamic', () => () => {
  const Probe = (props: { fabricJson: FabricJson | null }) => (
    <pre data-testid="canvas-json">{JSON.stringify(props.fabricJson)}</pre>
  );
  return Probe;
});

const baseProps = {
  viewKey: 'front',
  printArea: null,
  templateLayers: [],
  activeEffects: [],
  readOnly: true,
};

describe('SharedWorkshopCanvas (TTW-234)', () => {
  it('gives the canvas token-scoped image sources instead of session-only ones', () => {
    const fabricJson: FabricJson = {
      objects: [
        {
          type: 'image',
          src: 'http://localhost:3001/v1/design-assets/da_1/file?variant=original',
          data: { designAssetId: 'da_1' },
        },
      ],
    };

    render(<SharedWorkshopCanvas {...baseProps} fabricJson={fabricJson} shareToken="tok_123" />);

    const shown = screen.getByTestId('canvas-json').textContent ?? '';
    expect(shown).toContain('/public/designs/tok_123/assets/da_1/file');
    expect(shown).not.toContain('/design-assets/da_1/file');
  });

  it('passes the design through when there is no share token', () => {
    const fabricJson: FabricJson = {
      objects: [{ type: 'image', src: 'x', data: { designAssetId: 'da_1' } }],
    };

    render(<SharedWorkshopCanvas {...baseProps} fabricJson={fabricJson} />);

    expect(screen.getByTestId('canvas-json').textContent).toContain('"src":"x"');
  });
});
