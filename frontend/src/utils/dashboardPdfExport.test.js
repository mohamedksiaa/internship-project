import { describe, it, expect, vi, beforeEach } from 'vitest';

// html2canvas can throw "Unable to find element in cloned iframe" as a
// one-off timing race (it clones the target into a hidden iframe and
// re-locates it there; if the source DOM is still settling between the
// clone and the walk, that lookup can miss). generateDashboardPdf must
// retry once on exactly this error and otherwise let real failures through.
const html2canvasMock = vi.fn();
vi.mock('html2canvas', () => ({ default: (...args) => html2canvasMock(...args) }));

const jsPdfInstance = {
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  text: vi.fn(),
  addImage: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn(),
  // Real jsPDF word-wraps by font metrics; the mock only needs to turn the
  // analysis text into "one array entry per line" so the pagination logic
  // (which only cares about line *count*, not exact wrap points) can be
  // exercised deterministically.
  splitTextToSize: vi.fn((text) => String(text).split('\n')),
};
vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function jsPDFMock() {
    return jsPdfInstance;
  }),
}));

const { generateDashboardPdf } = await import('./dashboardPdfExport.js');

function makeCanvasResult() {
  return { toDataURL: () => 'data:image/png;base64,fake', width: 400, height: 200 };
}

function makeEl(width = 400, height = 200) {
  return { offsetWidth: width, offsetHeight: height };
}

function baseParams(overrides = {}) {
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

describe('dashboardPdfExport — html2canvas cloned-iframe race', () => {
  beforeEach(() => {
    html2canvasMock.mockReset();
    Object.values(jsPdfInstance).forEach((fn) => fn.mockClear());
  });

  it('retries once and succeeds when html2canvas throws the cloned-iframe race error', async () => {
    html2canvasMock
      .mockRejectedValueOnce(new Error('Unable to find element in cloned iframe'))
      .mockResolvedValueOnce(makeCanvasResult());

    await generateDashboardPdf(
      baseParams({ configuredChart: { el: makeEl(), caption: 'Chart' } })
    );

    expect(html2canvasMock).toHaveBeenCalledTimes(2);
    expect(jsPdfInstance.addImage).toHaveBeenCalledTimes(1);
    expect(jsPdfInstance.save).toHaveBeenCalledWith('test.pdf');
  });

  it('does not retry and rethrows for any other error', async () => {
    html2canvasMock.mockRejectedValueOnce(new Error('some other failure'));

    await expect(
      generateDashboardPdf(baseParams({ configuredChart: { el: makeEl(), caption: 'Chart' } }))
    ).rejects.toThrow('some other failure');

    expect(html2canvasMock).toHaveBeenCalledTimes(1);
  });

  it('still fails if the cloned-iframe race happens twice in a row', async () => {
    html2canvasMock
      .mockRejectedValueOnce(new Error('Unable to find element in cloned iframe'))
      .mockRejectedValueOnce(new Error('Unable to find element in cloned iframe'));

    await expect(
      generateDashboardPdf(baseParams({ configuredChart: { el: makeEl(), caption: 'Chart' } }))
    ).rejects.toThrow('Unable to find element in cloned iframe');

    expect(html2canvasMock).toHaveBeenCalledTimes(2);
  });

  it('waits for the element to have a real size before capturing, instead of a fixed delay', async () => {
    const el = makeEl(0, 0);
    html2canvasMock.mockImplementation(() => {
      // By the time html2canvas is actually invoked, the element must
      // already have a non-zero box — proves the wait happened rather
      // than the call firing immediately against a 0x0 element.
      expect(el.offsetWidth).toBeGreaterThan(0);
      return Promise.resolve(makeCanvasResult());
    });

    // Simulate the element's size settling a couple of frames in.
    let frame = 0;
    const originalRaf = global.requestAnimationFrame;
    global.requestAnimationFrame = (cb) => {
      frame += 1;
      if (frame >= 2) {
        el.offsetWidth = 400;
        el.offsetHeight = 200;
      }
      return setTimeout(cb, 0);
    };

    try {
      await generateDashboardPdf(baseParams({ configuredChart: { el, caption: 'Chart' } }));
    } finally {
      global.requestAnimationFrame = originalRaf;
    }

    expect(html2canvasMock).toHaveBeenCalledTimes(1);
  });

  it('reads configuredChart.el lazily at capture time, not once upfront', async () => {
    // DashboardPage.jsx passes `configuredChart.el` as a `get el()` getter
    // backed by a ref, not a plain value read once — so it always resolves
    // whatever's live at the moment generateDashboardPdf actually captures
    // it, never a snapshot taken before that. This proves that contract:
    // a getter backed by a mutable ref sees the *post-swap* element, never
    // the one that was current when the params object was built.
    const ref = { current: makeEl() };
    const params = baseParams({
      configuredChart: { get el() { return ref.current; }, caption: 'Chart' },
    });

    html2canvasMock.mockImplementation((el) => {
      // If this ever receives the pre-swap element, the getter isn't
      // being re-read at capture time and the fix has regressed.
      expect(el).toBe(ref.current);
      return Promise.resolve(makeCanvasResult());
    });

    // Simulate a re-render replacing the DOM node under the ref before
    // generateDashboardPdf gets around to capturing it — the params
    // object above was already built at this point, same as in
    // DashboardPage.jsx's handleExportPdf.
    ref.current = makeEl();

    await generateDashboardPdf(params);

    expect(html2canvasMock).toHaveBeenCalledTimes(1);
  });
});

describe('dashboardPdfExport — analysis text pagination', () => {
  beforeEach(() => {
    html2canvasMock.mockReset().mockResolvedValue(makeCanvasResult());
    Object.values(jsPdfInstance).forEach((fn) => fn.mockClear());
  });

  it('never calls addPage for a short analysis text that comfortably fits on one page', async () => {
    await generateDashboardPdf(
      baseParams({
        configuredChart: { el: makeEl(), caption: 'Chart' },
        analysisText: 'Ligne 1\nLigne 2\nLigne 3',
      })
    );

    expect(jsPdfInstance.addPage).not.toHaveBeenCalled();
  });

  it('starts a new page (and keeps writing every line) when the analysis text — now listing every crossed category, not just the dominant one — runs past the bottom of the page', async () => {
    // buildChartAnalysisText can now produce one block (header + several
    // bullet lines) per category; with e.g. 8 categories that's easily
    // 50+ lines, well past what one A4 page holds below the chart image.
    const manyLines = Array.from({ length: 80 }, (_, i) => `Ligne ${i + 1}`).join('\n');

    await generateDashboardPdf(
      baseParams({
        configuredChart: { el: makeEl(), caption: 'Chart' },
        analysisText: manyLines,
      })
    );

    expect(jsPdfInstance.addPage.mock.calls.length).toBeGreaterThan(0);
    // Every single line still gets written — pagination must never drop
    // content, only move the cursor to a fresh page for it.
    const writtenLines = jsPdfInstance.text.mock.calls.map((call) => call[0]);
    for (let i = 1; i <= 80; i++) {
      expect(writtenLines).toContain(`Ligne ${i}`);
    }
  });
});
