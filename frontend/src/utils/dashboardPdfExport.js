// jsPDF and html2canvas live ONLY in this file. DashboardPage.jsx reaches it
// exclusively via a dynamic import() at the moment the user clicks
// "Export PDF" — Vite puts everything reachable only through that import()
// in its own chunk, so these ~330 KB never load for anyone who doesn't use
// the feature (verified against the built bundle, see the PR notes).
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const PAGE_WIDTH_MM = 210;
const MARGIN_MM = 15;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const CAPTION_HEIGHT_MM = 8;
const ANALYSIS_GAP_MM = 6;
const ANALYSIS_LINE_HEIGHT_MM = 5;

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
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let cursorY = MARGIN_MM;

  doc.setFontSize(16);
  doc.text(title, MARGIN_MM, cursorY);
  cursorY += 8;

  doc.setFontSize(9);
  doc.setTextColor(130);
  doc.text(generatedAtLabel, MARGIN_MM, cursorY);
  doc.setTextColor(20);
  cursorY += 8;

  doc.setFontSize(11);
  summaryLines.forEach((line) => {
    doc.text(line, MARGIN_MM, cursorY);
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
      doc.text(configuredChart.caption, MARGIN_MM, cursorY);
      cursorY += CAPTION_HEIGHT_MM;
      doc.setFontSize(10);
      doc.setTextColor(130);
      doc.text(emptyChartMessage, MARGIN_MM, cursorY);
    } else {
      const { dataUrl, width, height } = await captureElementAsImage(configuredChart.el);
      const imgWidthMm = CONTENT_WIDTH_MM;
      const imgHeightMm = (height / width) * imgWidthMm;

      doc.text(configuredChart.caption, MARGIN_MM, cursorY);
      cursorY += CAPTION_HEIGHT_MM;

      doc.addImage(dataUrl, 'PNG', MARGIN_MM, cursorY, imgWidthMm, imgHeightMm);
      cursorY += imgHeightMm;

      if (analysisText) {
        cursorY += ANALYSIS_GAP_MM;
        doc.setFontSize(10);
        doc.setTextColor(60);
        const lines = doc.splitTextToSize(analysisText, CONTENT_WIDTH_MM);
        lines.forEach((line) => {
          doc.text(line, MARGIN_MM, cursorY);
          cursorY += ANALYSIS_LINE_HEIGHT_MM;
        });
        doc.setTextColor(20);
      }
    }
  }

  doc.save(fileName);
}
