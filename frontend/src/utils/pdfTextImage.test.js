import { describe, it, expect, vi, afterEach } from 'vitest';
import { containsRtlScript, wrapTextToWidth, renderTextLine, PX_PER_MM } from './pdfTextImage.js';

// jsdom has no canvas: a fake 2D context whose text width is 10 px per character.
function installFakeCanvas() {
  const ctx = {
    fillText: vi.fn(),
    measureText: vi.fn((s) => ({ width: String(s).length * 10 })),
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: vi.fn(() => 'data:image/png;base64,TEXT') };
  vi.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'canvas' ? canvas : {}));
  return { ctx, canvas };
}

afterEach(() => vi.restoreAllMocks());

describe('containsRtlScript', () => {
  it('detects Arabic, Hebrew and Arabic presentation forms', () => {
    expect(containsRtlScript('لوحة تحكم TimeFlow')).toBe(true);
    expect(containsRtlScript('שלום')).toBe(true);
    expect(containsRtlScript('ﻻ')).toBe(true);
  });
  it('is false for Latin text, digits, accents and empty values', () => {
    expect(containsRtlScript('Tableau de bord — été 2026 (10:00:00)')).toBe(false);
    expect(containsRtlScript('')).toBe(false);
    expect(containsRtlScript(null)).toBe(false);
    expect(containsRtlScript(undefined)).toBe(false);
  });
});

describe('renderTextLine', () => {
  it('draws right-aligned with a rtl direction from the right edge when rtl', () => {
    const { ctx, canvas } = installFakeCanvas();
    const line = renderTextLine('مرحبا', { sizePt: 10, gray: 60, rtl: true, widthMm: 180 });
    expect(ctx.direction).toBe('rtl');
    expect(ctx.textAlign).toBe('right');
    expect(ctx.fillText).toHaveBeenCalledWith('مرحبا', canvas.width, expect.any(Number));
    expect(canvas.width).toBe(180 * PX_PER_MM);
    expect(line).toMatchObject({ dataUrl: 'data:image/png;base64,TEXT', widthMm: 180 });
    expect(line.baselineMm).toBeGreaterThan(0);
    expect(line.baselineMm).toBeLessThan(line.heightMm);
  });
  it('draws left-aligned from x=0 when ltr (Arabic name inside a French PDF)', () => {
    const { ctx } = installFakeCanvas();
    renderTextLine('مشروع', { sizePt: 10, gray: 60, rtl: false, widthMm: 180 });
    expect(ctx.direction).toBe('ltr');
    expect(ctx.textAlign).toBe('left');
    expect(ctx.fillText).toHaveBeenCalledWith('مشروع', 0, expect.any(Number));
  });
  it('uses the requested gray', () => {
    const { ctx } = installFakeCanvas();
    renderTextLine('x', { sizePt: 10, gray: 130, rtl: false, widthMm: 50 });
    expect(ctx.fillStyle).toBe('rgb(130, 130, 130)');
  });
  it('returns null when there is no canvas', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({ getContext: () => null });
    expect(renderTextLine('x', { sizePt: 10, gray: 0, rtl: false, widthMm: 50 })).toBeNull();
  });
});

describe('wrapTextToWidth', () => {
  it('breaks where the measured width exceeds the max, on word boundaries', () => {
    installFakeCanvas();
    // 10 px/char; 20 mm * 8 px = 160 px = 16 chars
    expect(wrapTextToWidth('aaaa bbbb cccc dddd eeee', { sizePt: 10, rtl: false, maxWidthMm: 20 }))
      .toEqual(['aaaa bbbb cccc', 'dddd eeee']);
  });
  it('keeps an over-long single word on its own line instead of looping', () => {
    installFakeCanvas();
    expect(wrapTextToWidth('abcdefghijklmnopqrstuvwxyz ok', { sizePt: 10, rtl: false, maxWidthMm: 20 }))
      .toEqual(['abcdefghijklmnopqrstuvwxyz', 'ok']);
  });
  it('returns null without a canvas', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({ getContext: () => null });
    expect(wrapTextToWidth('a b', { sizePt: 10, rtl: false, maxWidthMm: 20 })).toBeNull();
  });
});
