// jsPDF and html2canvas live ONLY in this file. DashboardPage.jsx reaches it
// exclusively via a dynamic import() at the moment the user clicks
// "Export PDF" — Vite puts everything reachable only through that import()
// in its own chunk, so these ~330 KB never load for anyone who doesn't use
// the feature (verified against the built bundle, see the PR notes).
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 15;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const CAPTION_HEIGHT_MM = 8;
const SECTION_GAP_MM = 10;

async function captureElementAsImage(el) {
  // scale: 2 -> a real DPI bump for print legibility, not just a 1:1 screen
  // grab (recharts' small axis-tick font otherwise looks blurry in the PDF).
  const canvas = await html2canvas(el, { scale: 2, useCORS: true });
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}

/**
 * @param {object} params
 * @param {string} params.fileName
 * @param {string} params.title
 * @param {string} params.generatedAtLabel
 * @param {string[]} params.summaryLines
 * @param {{el: HTMLElement, caption: string}|null} params.configuredChart
 * @param {Array<{el: HTMLElement, caption: string}>} params.fixedViews Already filtered for redundancy by the caller.
 * @param {string} params.emptyChartMessage Shown instead of an image when a section's el has no capturable content.
 */
export async function generateDashboardPdf({
  fileName,
  title,
  generatedAtLabel,
  summaryLines,
  configuredChart,
  fixedViews,
  emptyChartMessage,
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

  const sections = [...(configuredChart ? [configuredChart] : []), ...fixedViews];

  for (const section of sections) {
    doc.setFontSize(12);
    doc.setTextColor(20);

    // A section without a real chart element (e.g. the user's configured
    // view currently has no data) still gets its caption + a text fallback,
    // rather than being silently dropped or crashing on a null capture.
    if (!section.el) {
      if (cursorY + CAPTION_HEIGHT_MM * 2 > PAGE_HEIGHT_MM - MARGIN_MM) {
        doc.addPage();
        cursorY = MARGIN_MM;
      }
      doc.text(section.caption, MARGIN_MM, cursorY);
      cursorY += CAPTION_HEIGHT_MM;
      doc.setFontSize(10);
      doc.setTextColor(130);
      doc.text(emptyChartMessage, MARGIN_MM, cursorY);
      doc.setTextColor(20);
      cursorY += CAPTION_HEIGHT_MM + SECTION_GAP_MM;
      continue;
    }

    const { dataUrl, width, height } = await captureElementAsImage(section.el);
    const imgWidthMm = CONTENT_WIDTH_MM;
    const imgHeightMm = (height / width) * imgWidthMm;

    if (cursorY + CAPTION_HEIGHT_MM + imgHeightMm > PAGE_HEIGHT_MM - MARGIN_MM) {
      doc.addPage();
      cursorY = MARGIN_MM;
    }

    doc.text(section.caption, MARGIN_MM, cursorY);
    cursorY += CAPTION_HEIGHT_MM;

    doc.addImage(dataUrl, 'PNG', MARGIN_MM, cursorY, imgWidthMm, imgHeightMm);
    cursorY += imgHeightMm + SECTION_GAP_MM;
  }

  doc.save(fileName);
}
