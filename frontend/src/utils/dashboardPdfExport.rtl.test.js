import { describe, it, expect, vi, beforeEach } from 'vitest';

// Text with a right-to-left script cannot be written by jsPDF's default font
// (it comes out as unrelated characters). It must be drawn as an image, decided
// by the CONTENT of each string, never by the interface language alone.
const html2canvasMock = vi.fn();
vi.mock('html2canvas', () => ({ default: (...a) => html2canvasMock(...a) }));

const jsPdfInstance = {
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  text: vi.fn(),
  addImage: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn(),
  splitTextToSize: vi.fn((text) => String(text).split('\n')),
};
const jsPdfCtor = vi.fn(function jsPDFMock() {
  return jsPdfInstance;
});
vi.mock('jspdf', () => ({ jsPDF: jsPdfCtor }));

const renderTextLine = vi.fn();
const wrapTextToWidth = vi.fn();
vi.mock('./pdfTextImage.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, renderTextLine: (...a) => renderTextLine(...a), wrapTextToWidth: (...a) => wrapTextToWidth(...a) };
});

const { generateDashboardPdf } = await import('./dashboardPdfExport.js');

// A chart with a real (non-empty) capture, which is what the analysis text sits under.
const chart = (caption = 'Chart') => ({ el: { offsetWidth: 400, offsetHeight: 200 }, caption });
const LINE = { dataUrl: 'data:image/png;base64,TXT', widthMm: 180, heightMm: 5, baselineMm: 4 };

function params(overrides = {}) {
  return {
    fileName: 'test.pdf',
    title: 'Title',
    generatedAtLabel: 'Generated',
    summaryLines: ['line1'],
    configuredChart: null,
    emptyChartMessage: 'empty',
    ...overrides,
  };
}

const textCalls = () => jsPdfInstance.text.mock.calls.map((c) => c[0]);
const imageTexts = () => renderTextLine.mock.calls.map((c) => c[0]);

describe('dashboardPdfExport — right-to-left text', () => {
  beforeEach(() => {
    Object.values(jsPdfInstance).forEach((fn) => fn.mockClear());
    html2canvasMock.mockReset().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,CHART', width: 400, height: 200 });
    jsPdfCtor.mockClear();
    renderTextLine.mockReset().mockReturnValue(LINE);
    wrapTextToWidth.mockReset().mockImplementation((t) => [t]);
  });

  it('keeps a Latin-only PDF exactly as before: vector text only, no image text, not compressed', async () => {
    await generateDashboardPdf(params({ configuredChart: chart(), analysisText: 'Alpha 40%.\nBeta 30%.' }));
    expect(renderTextLine).not.toHaveBeenCalled();
    expect(wrapTextToWidth).not.toHaveBeenCalled();
    expect(textCalls()).toEqual(['Title', 'Generated', 'line1', 'Chart', 'Alpha 40%.', 'Beta 30%.']);
    expect(jsPdfCtor).toHaveBeenCalledWith({ unit: 'mm', format: 'a4' });
    expect(jsPdfInstance.splitTextToSize).toHaveBeenCalledTimes(1);
  });

  it('draws Arabic title, date and summary lines as images, never with doc.text', async () => {
    await generateDashboardPdf(params({
      title: 'لوحة تحكم TimeFlow',
      generatedAtLabel: 'تم الإنشاء في ٢٠٢٦',
      summaryLines: ['الإجمالي: 10:00:00'],
      rtl: true,
    }));
    expect(imageTexts()).toEqual(['لوحة تحكم TimeFlow', 'تم الإنشاء في ٢٠٢٦', 'الإجمالي: 10:00:00']);
    expect(jsPdfInstance.text).not.toHaveBeenCalled();
    expect(jsPdfInstance.addImage).toHaveBeenCalledTimes(3);
    expect(renderTextLine.mock.calls[0][1]).toMatchObject({ rtl: true, sizePt: 16 });
  });

  it('places the image so its baseline sits where the text baseline would be', async () => {
    await generateDashboardPdf(params({ title: 'عنوان' }));
    // first text baseline is at the 15 mm margin; image top = baseline - baselineMm
    expect(jsPdfInstance.addImage).toHaveBeenCalledWith(LINE.dataUrl, 'PNG', 15, 15 - LINE.baselineMm, LINE.widthMm, LINE.heightMm);
  });

  it('is decided by content, not language: an Arabic project name in an LTR PDF is an image, the rest stays vector', async () => {
    await generateDashboardPdf(params({ summaryLines: ['Total: 10:00:00', 'Projet: مشروع ألفا'], rtl: false }));
    expect(imageTexts()).toEqual(['Projet: مشروع ألفا']);
    expect(renderTextLine.mock.calls[0][1]).toMatchObject({ rtl: false });
    expect(textCalls()).toContain('Total: 10:00:00');
    expect(textCalls()).not.toContain('Projet: مشروع ألفا');
  });

  it('compresses only when some text is drawn as an image', async () => {
    await generateDashboardPdf(params({ title: 'عنوان' }));
    expect(jsPdfCtor).toHaveBeenLastCalledWith({ unit: 'mm', format: 'a4', compress: true });
  });

  it('wraps an Arabic analysis paragraph with the browser font and draws every line as an image, even one with no Arabic letter', async () => {
    wrapTextToWidth.mockImplementation(() => ['مشروع ألفا يمثل 40%', '04:00:00.']);
    await generateDashboardPdf(params({ configuredChart: chart(), analysisText: 'مشروع ألفا يمثل 40% بمقدار 04:00:00.', rtl: true }));
    expect(wrapTextToWidth).toHaveBeenCalledTimes(1);
    expect(imageTexts()).toContain('04:00:00.');
    expect(textCalls()).not.toContain('04:00:00.');
    expect(jsPdfInstance.splitTextToSize).not.toHaveBeenCalled();
  });

  it('wraps mixed analysis paragraph by paragraph: Latin ones with jsPDF, Arabic ones with the browser', async () => {
    await generateDashboardPdf(params({ configuredChart: chart(), analysisText: 'Plain line\nمشروع ألفا' }));
    expect(jsPdfInstance.splitTextToSize).toHaveBeenCalledWith('Plain line', expect.any(Number));
    expect(wrapTextToWidth).toHaveBeenCalledWith('مشروع ألفا', expect.objectContaining({ sizePt: 10 }));
    expect(textCalls()).toContain('Plain line');
    expect(imageTexts()).toContain('مشروع ألفا');
  });

  it('paginates image lines like text lines', async () => {
    const many = Array.from({ length: 80 }, (_, i) => `سطر ${i}`).join('\n');
    wrapTextToWidth.mockImplementation((t) => [t]);
    await generateDashboardPdf(params({ configuredChart: chart(), analysisText: many }));
    expect(jsPdfInstance.addPage).toHaveBeenCalled();
    expect(renderTextLine.mock.calls.filter((c) => c[0].startsWith('سطر'))).toHaveLength(80);
  });

  it('falls back to doc.text when no canvas is available', async () => {
    renderTextLine.mockReturnValue(null);
    await generateDashboardPdf(params({ title: 'عنوان' }));
    expect(textCalls()).toContain('عنوان');
  });

  it('falls back to jsPDF wrapping when the browser cannot measure text', async () => {
    wrapTextToWidth.mockReturnValue(null);
    await generateDashboardPdf(params({ configuredChart: chart(), analysisText: 'مشروع ألفا' }));
    expect(jsPdfInstance.splitTextToSize).toHaveBeenCalledWith('مشروع ألفا', expect.any(Number));
  });
});

describe('dashboardPdfExport — right-to-left chart texts', () => {
  beforeEach(() => {
    Object.values(jsPdfInstance).forEach((fn) => fn.mockClear());
    renderTextLine.mockReset().mockReturnValue(LINE);
  });

  it('draws an Arabic chart caption as an image', async () => {
    html2canvasMock.mockResolvedValue({ toDataURL: () => 'data:image/png;base64,CHART', width: 400, height: 200 });
    await generateDashboardPdf(params({ configuredChart: chart('الرسم البياني'), rtl: true }));
    expect(imageTexts()).toContain('الرسم البياني');
  });

  it('draws an Arabic caption and empty-chart message as images when the capture is empty', async () => {
    await generateDashboardPdf(params({ configuredChart: { el: null, caption: 'الرسم البياني' }, emptyChartMessage: 'لا توجد بيانات', rtl: true }));
    expect(imageTexts()).toEqual(expect.arrayContaining(['الرسم البياني', 'لا توجد بيانات']));
  });
});
