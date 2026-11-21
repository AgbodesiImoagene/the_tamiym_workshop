/**
 * TTW-103: the Design Workshop may only offer fonts it ships and loads itself. A font that
 * depends on the visitor's machine prints differently from what the customer saw.
 */
import {
  DEFAULT_FONT_FAMILY,
  WORKSHOP_FONTS,
  fontDescriptor,
  isWorkshopFont,
  loadFontsForObjects,
} from '@/lib/workshop-fonts';

describe('WORKSHOP_FONTS', () => {
  it('offers only fonts that are shipped with the app', () => {
    for (const font of WORKSHOP_FONTS) {
      // Every offered font comes from an installed @fontsource package, so it renders on a
      // machine that does not have it installed.
      expect(() => require.resolve(`@fontsource/${font.packageSlug}/latin-400.css`)).not.toThrow();
    }
  });

  it('does not offer fonts that depend on the visitor machine', () => {
    const families = WORKSHOP_FONTS.map((f) => f.family);
    for (const machineFont of ['Arial', 'Helvetica', 'Impact', 'Trebuchet MS', 'Georgia']) {
      expect(families).not.toContain(machineFont);
    }
    expect(families).toEqual(
      expect.arrayContaining(['Montserrat', 'Oswald', 'Playfair Display', 'Roboto'])
    );
  });

  it('uses a listed font by default', () => {
    expect(isWorkshopFont(DEFAULT_FONT_FAMILY)).toBe(true);
  });
});

describe('fontDescriptor', () => {
  it('builds a CSS font descriptor with style, weight, size and quoted family', () => {
    expect(
      fontDescriptor({ fontFamily: 'Playfair Display', fontWeight: 'bold', fontStyle: 'italic' })
    ).toBe('italic 700 24px "Playfair Display"');
    expect(fontDescriptor({ fontFamily: 'Roboto' })).toBe('normal 400 24px "Roboto"');
  });
});

describe('loadFontsForObjects', () => {
  const load = jest.fn();

  beforeEach(() => {
    load.mockReset().mockResolvedValue([]);
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
  });

  it('asks the browser to load each offered font used by a text object, once', async () => {
    await loadFontsForObjects([
      { fontFamily: 'Montserrat', fontWeight: 'normal', fontStyle: 'normal' },
      { fontFamily: 'Montserrat', fontWeight: 'normal', fontStyle: 'normal' },
      { fontFamily: 'Oswald', fontWeight: 'bold', fontStyle: 'normal' },
      { type: 'image' },
    ]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledWith('normal 400 24px "Montserrat"', expect.any(String));
    expect(load).toHaveBeenCalledWith('normal 700 24px "Oswald"', expect.any(String));
  });

  it('passes the real text so the right unicode subset is downloaded', async () => {
    await loadFontsForObjects([{ fontFamily: 'Roboto', text: 'Ọlá Ṣẹ́yẹ' }]);
    expect(load).toHaveBeenCalledWith('normal 400 24px "Roboto"', 'Ọlá Ṣẹ́yẹ');
  });

  it('leaves fonts it does not ship to the browser', async () => {
    await loadFontsForObjects([{ fontFamily: 'Arial' }]);
    expect(load).not.toHaveBeenCalled();
  });

  it('returns true when something was loaded and does not throw when a load fails', async () => {
    load.mockRejectedValueOnce(new Error('network'));
    await expect(loadFontsForObjects([{ fontFamily: 'Roboto' }])).resolves.toBe(false);
    load.mockResolvedValueOnce([]);
    await expect(loadFontsForObjects([{ fontFamily: 'Roboto' }])).resolves.toBe(true);
  });

  it('does nothing where the font API does not exist', async () => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });
    await expect(loadFontsForObjects([{ fontFamily: 'Roboto' }])).resolves.toBe(false);
  });
});
