import { PdfService } from './pdf.service';

class FakePdfDocument {
  y = 40;
  addedPages = 0;
  textCalls: Array<{ value: string; options?: Record<string, unknown> }> = [];

  font() {
    return this;
  }

  fontSize() {
    return this;
  }

  fillColor() {
    return this;
  }

  rect() {
    return this;
  }

  fill() {
    return this;
  }

  text(value: string, _x?: number, y?: number, options?: Record<string, unknown>) {
    this.textCalls.push({ value, options });
    if (typeof y === 'number') this.y = y;
    return this;
  }

  heightOfString(value: string, options: { width: number }) {
    const lineCount = Math.max(1, Math.ceil(value.length / Math.max(1, options.width / 5)));
    return lineCount * 10;
  }

  moveTo() {
    return this;
  }

  lineTo() {
    return this;
  }

  lineWidth() {
    return this;
  }

  strokeColor() {
    return this;
  }

  stroke() {
    return this;
  }

  moveDown(lines = 1) {
    this.y += lines * 12;
    return this;
  }

  addPage() {
    this.addedPages += 1;
    this.y = 40;
    return this;
  }
}

describe('PdfService styled tables', () => {
  it('uses wrapped row height for long Vendor SP values', () => {
    const service = new PdfService();
    const document = new FakePdfDocument();

    service.addStyledTable(document as any, {
      columns: [{ key: 'name', label: 'Vendor', width: 100 }],
      rows: [{ name: 'Vendor dengan nama yang sangat panjang untuk pengujian wrapping' }],
    });

    expect(document.textCalls.some((call) => call.options?.lineBreak !== false)).toBe(true);
    expect(document.y).toBeGreaterThan(62);
  });

  it('creates a new page before a row would overlap the footer area', () => {
    const service = new PdfService();
    const document = new FakePdfDocument();
    document.y = 800;

    service.addStyledTable(document as any, {
      columns: [{ key: 'name', label: 'Vendor', width: 100 }],
      rows: [{ name: 'Vendor' }],
    });

    expect(document.addedPages).toBe(1);
  });

  it('does not repeat header across page breaks when repeatHeader is false', () => {
    const service = new PdfService();
    const document = new FakePdfDocument();

    service.addStyledTable(document as any, {
      repeatHeader: false,
      columns: [{ key: 'name', label: 'Pelanggaran', width: 100 }],
      rows: [
        { name: 'Row 1' },
        { name: 'Row 2' },
      ],
    });

    const headerCalls = document.textCalls.filter((c) => c.value === 'Pelanggaran');
    expect(headerCalls.length).toBe(1);
  });
});

describe('PdfService info boxes', () => {
  it('advances doc.y based on exact box height without double-counting row text', () => {
    const service = new PdfService();
    const document = new FakePdfDocument();
    document.y = 100;

    service.addInfoBox(document as any, 'Informasi Vendor', [
      { label: 'Nama Perusahaan', value: 'PT Vendor' },
      { label: 'PIC Vendor', value: 'Budi' },
    ]);

    // Box has title bar (22) + 2 items (approx 24 each = 48) + 8 padding + 10 margin = ~88
    expect(document.y).toBeLessThan(220);
  });

  it('renders compact 2-column info box with reduced height', () => {
    const service = new PdfService();
    const document = new FakePdfDocument();
    document.y = 100;

    service.addInfoBox(
      document as any,
      'Informasi Dokumen',
      [
        { label: 'Tanggal Generate', value: '2026-10-23' },
        { label: 'Kategori Filter', value: 'Semua Kategori' },
        { label: 'Periode Kuartal', value: 'Q4 2026' },
        { label: 'Total Vendor Bersih', value: '22 Vendor' },
      ],
      { columns: 2, marginBottom: 6 },
    );

    // 4 items in 2 columns only take 2 vertical rows (approx 70pt total height including title)
    expect(document.y).toBeLessThan(185);
  });
});

describe('PdfService signature boxes', () => {
  it('expands box height dynamically for long vendor names and roles without overflowing', () => {
    const service = new PdfService();
    const document = new FakePdfDocument();
    document.y = 100;

    service.addSignatureBox(
      document as any,
      [
        {
          header: 'PIHAK VENDOR',
          name: 'EVIDENCE THRESHOLD_SP3 PIC',
          role: 'SP_ORDER_RULE_EVIDENCE_VENDOR_THRESHOLD_SP3',
          placeholder: 'Tanda tangan & stempel vendor',
        },
        {
          header: 'PIHAK MITRA10',
          name: '(Admin Head Office)',
          role: 'PT Catur Mitra Sejati Sentosa (Mitra10)',
          placeholder: 'Tanda tangan & cap resmi HO',
        },
      ],
      { position: 'center' },
    );

    // Box height should dynamically accommodate the long wrapped role string
    expect(document.y).toBeGreaterThan(200);
  });
});

describe('PdfService footer pagination', () => {
  it('does not append a blank page while binding the footer', () => {
    const service = new PdfService();
    const document = service.createDocument(new Date('2026-10-22T00:00:00.000Z'));

    document.font('Helvetica').fontSize(10).text('Vendor SP content');
    const beforeFooter = document.bufferedPageRange().count;

    (service as any).bindFooter(
      document,
      new Date('2026-10-22T00:00:00.000Z'),
    );

    expect(document.bufferedPageRange().count).toBe(beforeFooter);
    document.end();
  });
});
