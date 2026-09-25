// jsPDF and html2canvas live ONLY in this file. DashboardPage.jsx reaches it
// exclusively via a dynamic import() at the moment the user clicks
// "Export PDF" — Vite puts everything reachable only through that import()
// in its own chunk, so these ~330 KB never load for anyone who doesn't use
// the feature (verified against the built bundle, see the PR notes).
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { containsRtlScript, renderTextLine, wrapTextToWidth } from './pdfTextImage.js';

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297; // A4 portrait
const MARGIN_MM = 15;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const CAPTION_HEIGHT_MM = 8;
const ANALYSIS_GAP_MM = 6;
const ANALYSIS_LINE_HEIGHT_MM = 5;
const ANALYSIS_FONT_PT = 10;

// Writes one line of text with its baseline at y. Text jsPDF can write itself
// goes through doc.text() exactly as it always did. Text containing a
// right-to-left script (Arabic, Hebrew...) cannot: jsPDF's default font has no
// such glyphs and shows garbage (see pdfTextImage.js), so it is drawn by the
// browser's text engine and inserted as an image. That depends on the CONTENT,
// not on the interface language: a project, employee or client named in Arabic
// breaks a French, English or German PDF just the same.
// `raster` forces the choice for one wrapped line of a paragraph already known
// to need it (a chunk such as "04:00:00." has no Arabic letter of its own).
function putText(doc, text, y, { sizePt, gray, rtl, raster }) {
  const asImage = raster === undefined ? containsRtlScript(text) : raster;
  if (asImage && text !== '') {
    const line = renderTextLine(text, { sizePt, gray, rtl, widthMm: CONTENT_WIDTH_MM });
    if (line) {
      doc.addImage(line.dataUrl, 'PNG', MARGIN_MM, y - line.baselineMm, line.widthMm, line.heightMm);
      return;
    }
    // No canvas (very old or locked-down browser): the old behaviour is the only one left.
  }
  doc.text(text, MARGIN_MM, y);
}

// The analysis text as lines to draw. Pure Latin text is wrapped by jsPDF in a
// single call, as before. As soon as it contains a right-to-left script it is
// wrapped paragraph by paragraph: those that contain one are measured and wrapped
// with the browser's font (jsPDF would measure them with Helvetica metrics and
// break them in the wrong places), the others are still wrapped by jsPDF.
function analysisLines(doc, analysisText, rtl) {
  if (!containsRtlScript(analysisText)) {
    return doc.splitTextToSize(analysisText, CONTENT_WIDTH_MM).map((text) => ({ text, raster: false }));
  }
  const out = [];
  String(analysisText).split('\n').forEach((paragraph) => {
    if (containsRtlScript(paragraph)) {
      const wrapped = wrapTextToWidth(paragraph, { sizePt: ANALYSIS_FONT_PT, rtl, maxWidthMm: CONTENT_WIDTH_MM });
      if (wrapped) {
        wrapped.forEach((text) => out.push({ text, raster: true }));
        return;
      }
    }
    doc.splitTextToSize(paragraph, CONTENT_WIDTH_MM).forEach((text) => out.push({ text, raster: false }));
  });
  return out;
}

// The analysis text now lists every crossed category with its own
// breakdown (buildChartAnalysisText in dashboardExport.js) instead of just
// the dominant one, so it can run to several dozen lines — long enough to
// run past the bottom of an A4 page. jsPDF never paginates on its own
// (doc.text() past the page edge just draws off it, invisibly); this is
// the one place in the export that can overflow enough for that to matter
// in practice, so it's the one place that now checks before every line and
// starts a fresh page rather than letting content disappear.
function ensureSpace(doc, cursorY, neededMm) {
  if (cursorY + neededMm > PAGE_HEIGHT_MM - MARGIN_MM) {
    doc.addPage();
    return MARGIN_MM;
  }
  return cursorY;
}

// Waits until `el` actually has a laid-out box (non-zero size) rather than
// trusting a fixed delay: on a genuinely first, cold page load the chart's
// mount + CSS application can still be mid-flight a fixed number of
// milliseconds later on a slow machine, and be long done on a fast one — a
// timeout is either too short or wastefully long. Polls one animation frame
// at a time and gives up after a bounded number of frames so a truly stuck
// element (e.g. no data to render) can't hang the export forever.
async function waitForStableSize(el, maxFrames = 15) {
  for (let i = 0; i < maxFrames; i++) {
    if (el.offsetWidth > 0 && el.offsetHeight > 0) return;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

// html2canvas clones the target into a hidden iframe and re-locates the
// element by walking the clone — if the source DOM mutates (layout,
// class list) between the clone and the walk, that lookup can miss and
// throw this exact message. It's a one-off timing race, not a real
// capture failure, so one retry (after another animation frame, so
// whatever was still settling gets another chance to finish) resolves it
// without bothering the user.
function isClonedIframeRace(err) {
  return String(err?.message || '').includes('Unable to find element in cloned iframe');
}

async function captureElementAsImage(el) {
  await waitForStableSize(el);

  // scale: 2 -> a real DPI bump for print legibility, not just a 1:1 screen
  // grab (recharts' small axis-tick font otherwise looks blurry in the PDF).
  const capture = () => html2canvas(el, { scale: 2, useCORS: true });

  let canvas;
  try {
    canvas = await capture();
  } catch (err) {
    if (!isClonedIframeRace(err)) throw err;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    canvas = await capture();
  }

  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/**
 * @param {object} params
 * @param {string} params.fileName
 * @param {string} params.title
 * @param {string} params.generatedAtLabel
 * @param {string[]} params.summaryLines
 * @param {{el: HTMLElement, caption: string}|null} params.configuredChart The user's currently configured chart — the only chart section in the PDF. See the PR notes for why the 3 fixed off-screen views this used to also include were removed rather than fixed a 5th time.
 * @param {string} params.emptyChartMessage Shown instead of an image when configuredChart.el has no capturable content.
 * @param {boolean} [params.rtl] The interface is right-to-left (Arabic): text drawn as an image is right-aligned with a right-to-left base direction. Text is drawn as an image whenever it contains a right-to-left script, whatever this is.
 * @param {string} [params.analysisText] Short factual analysis printed under the chart image (see buildChartAnalysisText in dashboardExport.js) — built by the caller from the same chartData/crossedData the chart itself renders from, so it can never disagree with the image above it. Omitted (no data / no image) when falsy.
 */
export async function generateDashboardPdf({
  fileName,
  title,
  generatedAtLabel,
  summaryLines,
  configuredChart,
  emptyChartMessage,
  analysisText,
  rtl = false,
}) {
  // Text drawn as an image is deflated: uncompressed, every such line would add
  // hundreds of KB. Nothing else changes for a PDF without any of it.
  const hasImageText = [title, generatedAtLabel, ...summaryLines, configuredChart?.caption, emptyChartMessage, analysisText].some(containsRtlScript);
  const doc = new jsPDF(hasImageText ? { unit: 'mm', format: 'a4', compress: true } : { unit: 'mm', format: 'a4' });
  let cursorY = MARGIN_MM;

  doc.setFontSize(16);
  putText(doc, title, cursorY, { sizePt: 16, gray: 0, rtl });
  cursorY += 8;

  doc.setFontSize(9);
  doc.setTextColor(130);
  putText(doc, generatedAtLabel, cursorY, { sizePt: 9, gray: 130, rtl });
  doc.setTextColor(20);
  cursorY += 8;

  doc.setFontSize(11);
  summaryLines.forEach((line) => {
    putText(doc, line, cursorY, { sizePt: 11, gray: 20, rtl });
    cursorY += 6;
  });
  cursorY += 4;

  if (configuredChart) {
    doc.setFontSize(12);
    doc.setTextColor(20);

    if (!configuredChart.el) {
      // The user's configured view currently has no data — still gets its
      // caption + a text fallback, rather than being silently dropped or
      // crashing on a null capture.
      putText(doc, configuredChart.caption, cursorY, { sizePt: 12, gray: 20, rtl });
      cursorY += CAPTION_HEIGHT_MM;
      doc.setFontSize(10);
      doc.setTextColor(130);
      putText(doc, emptyChartMessage, cursorY, { sizePt: 10, gray: 130, rtl });
    } else {
      const { dataUrl, width, height } = await captureElementAsImage(configuredChart.el);
      const imgWidthMm = CONTENT_WIDTH_MM;
      const imgHeightMm = (height / width) * imgWidthMm;

      putText(doc, configuredChart.caption, cursorY, { sizePt: 12, gray: 20, rtl });
      cursorY += CAPTION_HEIGHT_MM;

      doc.addImage(dataUrl, 'PNG', MARGIN_MM, cursorY, imgWidthMm, imgHeightMm);
      cursorY += imgHeightMm;

      if (analysisText) {
        cursorY = ensureSpace(doc, cursorY, ANALYSIS_GAP_MM + ANALYSIS_LINE_HEIGHT_MM);
        cursorY += ANALYSIS_GAP_MM;
        doc.setFontSize(ANALYSIS_FONT_PT);
        doc.setTextColor(60);
        analysisLines(doc, analysisText, rtl).forEach(({ text, raster }) => {
          cursorY = ensureSpace(doc, cursorY, ANALYSIS_LINE_HEIGHT_MM);
          putText(doc, text, cursorY, { sizePt: ANALYSIS_FONT_PT, gray: 60, rtl, raster });
          cursorY += ANALYSIS_LINE_HEIGHT_MM;
        });
        doc.setTextColor(20);
      }
    }
  }

  doc.save(fileName);
}
