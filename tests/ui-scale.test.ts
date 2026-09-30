import { expect, test } from 'bun:test';

/**
 * Densitas UI dijaga sebagai satu baris di src/web/app.css:
 *   html { zoom: 0.9; }
 * Di bawah 1 = seluruh tampilan (teks, tombol, padding, tabel) menyusut seragam;
 * 1 = ukuran semula. Regresi yang mudah terjadi: nilai dihapus atau > 1.
 */
const UI_SCALE_MIN = 0.75;
const UI_SCALE_MAX = 1;

test('app.css sets one shared UI density value on <html>', async () => {
  const css = await Bun.file(new URL('../src/web/app.css', import.meta.url)).text();
  const rule = css.match(/(^|\n)\s*html\s*\{([^}]*)\}/);
  const body: string = rule?.[2] ?? '';

  expect(body).toContain('zoom:');
  const value = Number((body.match(/zoom:\s*([\d.]+)/) ?? [])[1]);
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(UI_SCALE_MIN);
  expect(value).toBeLessThanOrEqual(UI_SCALE_MAX);
  expect(css).not.toContain('--ui-scale');
});