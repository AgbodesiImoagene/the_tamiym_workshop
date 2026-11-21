import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

/**
 * TTW-103: the fonts the Design Workshop offers are shipped and loaded by the app, so a text
 * set in one renders as that font on a machine that does not have it installed.
 * Uses the seeded Classic Tee (`e2e-product-classic-tee`).
 */
const TEE_PRODUCT_ID = 'e2e-product-classic-tee';
const OFFERED = ['Montserrat', 'Oswald', 'Playfair Display', 'Roboto'];
const MACHINE_FONTS = ['Arial', 'Helvetica', 'Impact', 'Trebuchet MS', 'Georgia'];

test.describe('Design workshop fonts @app', () => {
  test('every offered font renders as itself, is saved with its real size and survives a reopen', async ({
    customerPage: page,
  }) => {
    await page.goto(`/dashboard/design/new/${TEE_PRODUCT_ID}`);
    const addText = page.getByRole('heading', { name: 'Add Text' }).locator('..');
    const fontSelect = addText.getByRole('combobox').first();

    // The list holds only fonts the app ships.
    await fontSelect.click();
    const options = await page.getByRole('option').allTextContents();
    expect(options).toEqual(OFFERED);
    for (const machineFont of MACHINE_FONTS) expect(options).not.toContain(machineFont);
    await page.keyboard.press('Escape');

    // Every design the editor sends to the API (the first save and the ones after it).
    type Saved = {
      designData: {
        views: Record<
          string,
          { fabricJson: { objects: { fontFamily: string; text: string; width: number }[] } }
        >;
      };
    };
    const saves: Saved[] = [];
    page.on('request', (request) => {
      const isSave =
        /\/v1\/designs(\/[^/?]+)?$/.test(request.url()) &&
        ['POST', 'PUT', 'PATCH'].includes(request.method());
      if (isSave) saves.push(request.postDataJSON() as Saved);
    });

    // One text per offered font.
    const stamp = Date.now();
    const labels = OFFERED.map((font) => `${font} wide sample ${stamp}`);
    for (const [index, font] of OFFERED.entries()) {
      await fontSelect.click();
      await page.getByRole('option', { name: font, exact: true }).click();
      await page.getByPlaceholder('Enter text…').fill(labels[index]);
      await page.getByRole('button', { name: 'Add to canvas' }).click();
      await expect(page.getByRole('button', { name: `Select ${labels[index]}` })).toBeVisible();
    }

    // The browser downloaded every face (not a fallback).
    for (const font of OFFERED) {
      await expect
        .poll(() =>
          page.evaluate(
            (family) =>
              [...document.fonts].some((f) => f.family.includes(family) && f.status === 'loaded'),
            font
          )
        )
        .toBe(true);
    }
    // Let the canvas measure and report the new sizes: two frames, not a timer.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );

    // What each text should measure with its real font, and with the default font it is first
    // measured with while the real one downloads.
    const expected = await page.evaluate(
      ({ fonts, texts }) => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        return fonts.map((family, i) => {
          ctx.font = `24px "${family}"`;
          const real = ctx.measureText(texts[i]).width;
          ctx.font = '24px serif';
          return { family, real, fallback: ctx.measureText(texts[i]).width };
        });
      },
      { fonts: OFFERED, texts: labels }
    );

    // Save (the editor may also save by itself): the last design sent to the API holds each
    // text with its font and a width that matches that font, not the default font.
    await page.getByLabel('Design name').fill(`Fonts ${stamp}`);
    const save = page.getByRole('button', { name: 'Save', exact: true });
    if (await save.isEnabled()) await save.click();
    await expect
      .poll(() => {
        const objects =
          saves.at(-1)?.designData.views[Object.keys(saves.at(-1)!.designData.views)[0]]?.fabricJson
            .objects;
        if (!objects || objects.length !== OFFERED.length) return false;
        return expected.every(({ family, real, fallback }) => {
          const saved = objects.find((o) => o.fontFamily === family);
          return !!saved && Math.abs(saved.width - real) < Math.abs(saved.width - fallback);
        });
      })
      .toBe(true);

    // Reopened (edit route, then a reload): the texts are back and their faces are loaded.
    await expect(page).toHaveURL(/\/dashboard\/design\/[^/]+\/edit/);
    await page.reload();
    for (const label of labels) {
      await expect(page.getByRole('button', { name: `Select ${label}` })).toBeVisible();
    }
    for (const font of OFFERED) {
      await expect
        .poll(() =>
          page.evaluate(
            (family) =>
              [...document.fonts].some((f) => f.family.includes(family) && f.status === 'loaded'),
            font
          )
        )
        .toBe(true);
    }
  });
});
