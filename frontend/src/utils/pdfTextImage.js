// Text for the Dashboard PDF that jsPDF cannot write itself.
//
// jsPDF's default font (Helvetica, WinAnsi) has no Arabic glyphs: doc.text() on
// an Arabic string stores its UTF-16 bytes and shows them as unrelated Latin
// characters ("þâþÜþ¤þ—…"), and any Latin letters in the same string come out
// spaced ("T i m e F l o w"). Adding a font to jsPDF is not enough either: its
// own Arabic handling gets the order of neutral characters wrong on real
// strings (parentheses swapped, final full stop and colon on the wrong side,
// the Arabic-Indic date scrambled). The browser already does all of this
// correctly — shaping, bidirectional order, digits, mirroring — so such text is
// drawn by the browser's text engine on a <canvas> and inserted as an image,
// exactly like the chart above it (which is why the chart's Arabic labels were
// never affected). No font is embedded: the canvas uses the system fonts that
// already display the interface.
//
// Lives in the same lazily loaded chunk as jsPDF (it is only imported by
// dashboardPdfExport.js), so it costs nothing for anyone who does not export.

// Hebrew, Arabic, Syriac, Thaana, N'Ko, Samaritan... and the Arabic
// presentation forms: anything jsPDF's default font cannot show.
const RTL_SCRIPT = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** Whether the text contains a right-to-left script character. */
export function containsRtlScript(text) {
  return RTL_SCRIPT.test(String(text ?? ''));
}

const FONT_STACK = 'system-ui, "Segoe UI", Tahoma, "Noto Sans Arabic", "Noto Naskh Arabic", Arial, sans-serif';
const PT_TO_MM = 25.4 / 72;
// About 200 dpi: crisp when printed, small once deflated.
export const PX_PER_MM = 8;
// A line box is 1.5 x the font size; the baseline sits at 76% of it, leaving
// room below for Arabic descenders and above for tall letters and diacritics.
const LINE_BOX = 1.5;
const BASELINE_RATIO = 0.76;

function pxFor(sizePt) {
  return sizePt * PT_TO_MM * PX_PER_MM;
}

function newContext() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  return ctx ? { canvas, ctx } : null;
}

/**
 * Greedy word wrap using the same font the text will be drawn with, so lines
 * break where they really fit. Returns null when no canvas is available.
 *
 * @param {string} text
 * @param {{sizePt:number, rtl:boolean, maxWidthMm:number}} options
 * @returns {string[]|null}
 */
export function wrapTextToWidth(text, { sizePt, rtl, maxWidthMm }) {
  const made = newContext();
  if (!made) return null;
  const { ctx } = made;
  ctx.font = `${pxFor(sizePt)}px ${FONT_STACK}`;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  const maxPx = maxWidthMm * PX_PER_MM;

  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxPx) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

/**
 * One line of text as a transparent PNG, ready for doc.addImage().
 *
 * @param {string} text
 * @param {{sizePt:number, gray:number, rtl:boolean, widthMm:number}} options
 *   rtl: base direction and alignment (right edge) of the line. The browser
 *   still orders mixed runs itself (an Arabic sentence with a Latin name in it,
 *   or the other way round).
 * @returns {{dataUrl:string, widthMm:number, heightMm:number, baselineMm:number}|null}
 *   null when no canvas is available.
 */
export function renderTextLine(text, { sizePt, gray, rtl, widthMm }) {
  const made = newContext();
  if (!made) return null;
  const { canvas, ctx } = made;

  const heightMm = sizePt * PT_TO_MM * LINE_BOX;
  const baselineMm = heightMm * BASELINE_RATIO;
  canvas.width = Math.ceil(widthMm * PX_PER_MM);
  canvas.height = Math.ceil(heightMm * PX_PER_MM);

  ctx.font = `${pxFor(sizePt)}px ${FONT_STACK}`;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
  ctx.fillText(String(text), rtl ? canvas.width : 0, baselineMm * PX_PER_MM);

  return { dataUrl: canvas.toDataURL('image/png'), widthMm, heightMm, baselineMm };
}
