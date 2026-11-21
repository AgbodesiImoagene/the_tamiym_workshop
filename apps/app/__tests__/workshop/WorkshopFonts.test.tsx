/**
 * TTW-103: text in an offered font is drawn again once the font has arrived, and the text tool
 * only lists fonts the app loads.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@tamiym/ui';
import TextTool from '@/components/workshop/TextTool';
import { WORKSHOP_FONTS } from '@/lib/workshop-fonts';

const textObject = {
  type: 'i-text',
  fontFamily: 'Montserrat',
  fontWeight: 'normal',
  fontStyle: 'normal',
  data: { layerId: 'a' },
  set: jest.fn(),
  initDimensions: jest.fn(),
  setCoords: jest.fn(),
  toJSON: jest.fn().mockReturnValue({ type: 'i-text' }),
};

const canvasMock = {
  add: jest.fn(),
  remove: jest.fn(),
  getObjects: jest.fn(),
  sendObjectToBack: jest.fn(),
  renderAll: jest.fn(),
  requestRenderAll: jest.fn(),
  toJSON: jest.fn().mockReturnValue({ objects: [] }),
  toDataURL: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  dispose: jest.fn(),
};

jest.mock('fabric', () => ({
  Canvas: jest.fn().mockImplementation(() => canvasMock),
  Rect: jest.fn().mockImplementation(() => ({})),
  util: { enlivenObjects: jest.fn().mockImplementation(async () => [textObject]) },
}));

import WorkshopCanvas from '@/components/workshop/WorkshopCanvas';

describe('saved text in an offered font', () => {
  let resolveLoad: () => void;
  const load = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    canvasMock.getObjects.mockReturnValue([textObject]);
    load.mockImplementation(
      () =>
        new Promise<unknown[]>((resolve) => {
          resolveLoad = () => resolve([]);
        })
    );
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
  });

  it('is measured and drawn again when its font arrives', async () => {
    render(
      <WorkshopCanvas
        viewKey="front"
        printArea={null}
        templateLayers={[]}
        activeEffects={[]}
        fabricJson={{ objects: [{ type: 'i-text', fontFamily: 'Montserrat', text: 'Hi' }] }}
      />
    );

    await waitFor(() =>
      expect(load).toHaveBeenCalledWith('normal 400 24px "Montserrat"', expect.any(String))
    );
    expect(textObject.initDimensions).not.toHaveBeenCalled();

    const rendersBefore = canvasMock.requestRenderAll.mock.calls.length;
    resolveLoad();

    await waitFor(() => expect(textObject.initDimensions).toHaveBeenCalled());
    expect(textObject.setCoords).toHaveBeenCalled();
    expect(canvasMock.requestRenderAll.mock.calls.length).toBeGreaterThan(rendersBefore);
  });
});

describe('TextTool font list', () => {
  beforeAll(() => {
    // jsdom has no layout: Radix Select scrolls the chosen option into view.
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('lists exactly the fonts the app loads', () => {
    render(
      <TooltipProvider>
        <TextTool onAddText={jest.fn()} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getAllByRole('combobox')[0]);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(WORKSHOP_FONTS.map((f) => f.family));
  });

  it('adds text in a loaded font by default', () => {
    const onAddText = jest.fn();
    render(
      <TooltipProvider>
        <TextTool onAddText={onAddText} />
      </TooltipProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add to canvas' }));
    const added = onAddText.mock.calls[0][0] as { fontFamily: string };
    expect(WORKSHOP_FONTS.map((f) => f.family)).toContain(added.fontFamily);
  });
});
