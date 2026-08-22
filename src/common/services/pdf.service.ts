import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');

/**
 * Reusable PDF builder untuk Poin 3 (Penalty Receipt), Poin 4
 * (No Violation Certificate), Poin 4 aggregate (Rekap Vendor Bersih).
 * Memakai pdfkit (pure Node, tidak butuh headless browser — sesuai
 * requirement deployment sederhana).
 *
 * Font: pdfkit built-in Helvetica (mendukung Latin-1 / WinAnsi).
 * Karakter Indonesia TANPA diakritik ("Pelanggaran", "Vendor", "Bukti",
 * "Quartal", "Tanggal") aman. Kalau di masa depan butuh huruf dengan
 * diakritik (mis. "Dépan", "Kafé"), tambahkan font TTF via doc.registerFont().
 *
 * Logo: placeholder teks MITRA10 (lihat addStyledHeader). Kalau ada asset
 * logo final nanti, override method addStyledHeader() dengan sharp().
 */
export interface PdfHeaderOptions {
  title: string;
  subtitle?: string;
}

export interface PdfTableColumn<T = any> {
  key: keyof T | string;
  label: string;
  /** Lebar kolom dalam points (A4 usable = ~480pt setelah margin). */
  width?: number;
  /** 'left' | 'center' | 'right'. Default 'left'. */
  align?: 'left' | 'center' | 'right';
  /** Opsional: ambil nilai custom dari row. */
  accessor?: (row: T) => string;
}

export interface PdfTableOptions<T = any> {
  columns: PdfTableColumn<T>[];
  rows: T[];
  startY?: number;
  /** Border: 'full' = semua sel, 'horizontal' = hanya row separator, 'none'. Default 'horizontal'. */
  border?: 'full' | 'horizontal' | 'none';
}

/**
 * Opsi styled table — header bg, striping, repeat header. Untuk Poin 4
 * aggregate Rekap Vendor Bersih (PDF styling baru).
 */
export interface PdfStyledTableOptions<T = any> extends PdfTableOptions<T> {
  /** Ulangi header di setiap halaman baru. Default true. */
  repeatHeader?: boolean;
  /** Warna stripe untuk baris genap. Default '#f5f8fa' (abu-abu sangat muda, konsisten dgn frontend striping). */
  stripeColor?: string;
  /** Warna background header. Default '#183383' (biru tua Mitra10, konsisten dengan header tabel di UI). */
  headerColor?: string;
}

export interface PdfSignatureSigner {
  name: string;
  role: string;
  /** Teks tambahan di bawah nama, mis. "(......................)" untuk area ttd. */
  placeholder?: string;
}

export interface PdfSignatureOptions {
  signers: PdfSignatureSigner[];
  /** Teks tambahan di atas section, mis. "Surat ini ditandatangani oleh:". */
  intro?: string;
}

/**
 * Opsi info box (Poin 4 aggregate) — label-value pairs dengan title bar
 * biru + body abu-abu sangat muda.
 */
export interface PdfInfoBoxItem {
  label: string;
  value: string;
}

export interface PdfInfoBoxOptions {
  /** Default '#f5f8fa'. */
  bgColor?: string;
  /** Default '#183383' (biru tua Mitra10). */
  borderColor?: string;
}

@Injectable()
export class PdfService {
  private readonly PAGE_MARGIN = 40;
  private readonly PAGE_WIDTH = 595.28; // A4
  private readonly PAGE_HEIGHT = 841.89; // A4
  /** Brand color: biru tua Mitra10 (konsisten dengan header tabel UI). */
  private readonly BRAND_COLOR = '#183383';
  /** Warna striping baris (konsisten dengan #e4e9f7 / #f5f8fa di frontend). */
  private readonly STRIPE_COLOR = '#f5f8fa';

  /**
   * Buat PDF document baru. Footer TIDAK di-bind di sini (akan di-bind
   * di pipeAndSave setelah semua pages ada, supaya bufferedPageRange akurat).
   */
  createDocument(generatedAt: Date = new Date()): PDFKit.PDFDocument {
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: this.PAGE_MARGIN,
        bottom: this.PAGE_MARGIN + 30, // extra untuk footer
        left: this.PAGE_MARGIN,
        right: this.PAGE_MARGIN,
      },
      info: {
        Title: 'Mitra10 Vendor SP Report',
        Author: 'Mitra10 Tukang Backend',
        CreationDate: generatedAt,
      },
    });

    return doc;
  }

  /**
   * Header STANDAR (Poin 3 + Poin 4 per-vendor): MITRA10 text logo + judul + sub-judul + garis pemisah.
   */
  addHeader(doc: PDFKit.PDFDocument, options: PdfHeaderOptions): void {
    const startY = doc.y;

    doc
      .fillColor(this.BRAND_COLOR)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text('MITRA10', this.PAGE_MARGIN, startY, { lineBreak: false });

    doc
      .fillColor('#666')
      .font('Helvetica')
      .fontSize(9)
      .text('Vendor SP Report System', this.PAGE_MARGIN, startY + 18, {
        lineBreak: false,
      });

    doc
      .fillColor('#000')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(options.title, this.PAGE_MARGIN, startY + 45, {
        width: this.PAGE_WIDTH - this.PAGE_MARGIN * 2,
        align: 'center',
      });

    if (options.subtitle) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#333')
        .text(options.subtitle, this.PAGE_MARGIN, doc.y, {
          width: this.PAGE_WIDTH - this.PAGE_MARGIN * 2,
          align: 'center',
        });
    }

    doc
      .moveTo(this.PAGE_MARGIN, doc.y + 8)
      .lineTo(this.PAGE_WIDTH - this.PAGE_MARGIN, doc.y + 8)
      .lineWidth(0.5)
      .strokeColor('#ccc')
      .stroke();

    doc.moveDown(1.2);
  }

  /**
   * Header STYLED (Poin 4 aggregate Rekap Vendor Bersih): logo box biru +
   * judul besar + hr accent line biru. Konsisten dengan brand Mitra10.
   *
   * NOTE: kalau ada asset logo resmi nanti, override method ini untuk
   * embed image via sharp() lalu doc.image(). Sementara pakai text logo.
   */
  addStyledHeader(
    doc: PDFKit.PDFDocument,
    options: { title: string; subtitle?: string; documentNo?: string },
  ): void {
    const startY = doc.y;
    const usableWidth = this.PAGE_WIDTH - this.PAGE_MARGIN * 2;

    // Logo box (kiri atas) — biru tua dengan teks putih "M10"
    const logoBoxWidth = 80;
    const logoBoxHeight = 36;
    doc
      .rect(this.PAGE_MARGIN, startY, logoBoxWidth, logoBoxHeight)
      .fill(this.BRAND_COLOR);
    doc
      .fillColor('#fff')
      .font('Helvetica-Bold')
      .fontSize(20)
      .text('M10', this.PAGE_MARGIN, startY + 9, {
        width: logoBoxWidth,
        align: 'center',
        lineBreak: false,
      });

    // Org name + system name (di samping logo box)
    doc
      .fillColor(this.BRAND_COLOR)
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('MITRA10', this.PAGE_MARGIN + logoBoxWidth + 12, startY + 5);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#555')
      .text(
        'Vendor SP Management System',
        this.PAGE_MARGIN + logoBoxWidth + 12,
        startY + 22,
      );

    // Document metadata (kanan atas) — Doc No + Generated date
    const metaX = this.PAGE_WIDTH - this.PAGE_MARGIN - 180;
    const metaWidth = 180;
    if (options.documentNo) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#666')
      .text(`Doc No: ${options.documentNo}`, metaX, startY + 5, {
        width: metaWidth,
        align: 'right',
      });
    }
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666')
      .text(
        `Generated: ${new Date().toISOString().slice(0, 10)}`,
        metaX,
        startY + 22,
        { width: metaWidth, align: 'right' },
      );

    // Move below header area
    doc.y = startY + logoBoxHeight + 14;

    // Big title (centered, bold, brand color)
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor(this.BRAND_COLOR)
      .text(options.title, this.PAGE_MARGIN, doc.y, {
        width: usableWidth,
        align: 'center',
      });

    if (options.subtitle) {
      doc.moveDown(0.3);
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#444')
        .text(options.subtitle, this.PAGE_MARGIN, doc.y, {
          width: usableWidth,
          align: 'center',
        });
    }

    doc.moveDown(0.7);

    // Accent HR line (biru)
    doc
      .moveTo(this.PAGE_MARGIN, doc.y)
      .lineTo(this.PAGE_WIDTH - this.PAGE_MARGIN, doc.y)
      .lineWidth(1)
      .strokeColor(this.BRAND_COLOR)
      .stroke();

    doc.moveDown(1);
  }

  /**
   * Section block STANDAR: judul + body lines polos.
   */
  addSection(
    doc: PDFKit.PDFDocument,
    title: string,
    lines: Array<{ label: string; value: string }>,
  ): void {
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#000')
      .text(title);

    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(10).fillColor('#222');

    for (const line of lines) {
      doc.text(`${line.label.padEnd(28, ' ')}: ${line.value || '-'}`, {
        indent: 0,
      });
    }
    doc.moveDown(1);
  }

  /**
   * Info Box STYLED (Poin 4 aggregate): title bar biru tua + body abu-abu
   * sangat muda dengan label-value pairs sejajar (2-kol layout).
   */
  addInfoBox(
    doc: PDFKit.PDFDocument,
    title: string,
    items: PdfInfoBoxItem[],
    options?: PdfInfoBoxOptions,
  ): void {
    const usableWidth = this.PAGE_WIDTH - this.PAGE_MARGIN * 2;
    const bgColor = options?.bgColor ?? this.STRIPE_COLOR;
    const borderColor = options?.borderColor ?? this.BRAND_COLOR;
    const titleBarHeight = 22;
    const rowHeight = 20;
    const labelColWidth = usableWidth * 0.35;

    const startY = doc.y;

    // Title bar
    doc
      .rect(this.PAGE_MARGIN, startY, usableWidth, titleBarHeight)
      .fill(borderColor);
    doc
      .fillColor('#fff')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(title, this.PAGE_MARGIN + 8, startY + 6);

    doc.y = startY + titleBarHeight;

    // Body bg
    const bodyHeight = items.length * rowHeight + 8;
    doc
      .rect(this.PAGE_MARGIN, doc.y, usableWidth, bodyHeight)
      .fill(bgColor);

    items.forEach((item, idx) => {
      const itemY = doc.y + 4 + idx * rowHeight;
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#555')
        .text(item.label, this.PAGE_MARGIN + 10, itemY, {
          width: labelColWidth - 12,
          lineBreak: false,
        });
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#000')
        .text(item.value || '-', this.PAGE_MARGIN + labelColWidth, itemY, {
          width: usableWidth - labelColWidth - 16,
          lineBreak: false,
        });
    });

    doc.y = doc.y + bodyHeight + 10;
  }

  /**
   * Table helper STANDAR — simple border, no striping. Dipakai Poin 3 + Poin 4.
   */
  addTable<T = any>(doc: PDFKit.PDFDocument, options: PdfTableOptions<T>): void {
    const cols = options.columns;
    const usableWidth = this.PAGE_WIDTH - this.PAGE_MARGIN * 2;
    const borderMode = options.border ?? 'horizontal';

    const colWidths = cols.map((c) => c.width ?? usableWidth / cols.length);

    const drawHeader = () => {
      const headerY = doc.y;
      let xCursor = this.PAGE_MARGIN;

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff');

      doc
        .rect(this.PAGE_MARGIN, headerY - 2, usableWidth, 16)
        .fill(this.BRAND_COLOR);

      cols.forEach((col, i) => {
        const w = colWidths[i];
        doc.fillColor('#fff').text(
          String(col.label),
          xCursor + 3,
          headerY,
          {
            width: w - 6,
            align: col.align ?? 'left',
            lineBreak: false,
            ellipsis: true,
          },
        );
        xCursor += w;
      });

      doc.fillColor('#000');
      doc.y = headerY + 16;
    };

    const drawRow = (row: T) => {
      const rowY = doc.y;
      let xCursor = this.PAGE_MARGIN;
      doc.font('Helvetica').fontSize(9).fillColor('#000');

      if (rowY > this.PAGE_HEIGHT - this.PAGE_MARGIN - 30) {
        doc.addPage();
        drawHeader();
      }

      const finalRowY = doc.y;

      cols.forEach((col, i) => {
        const w = colWidths[i];
        const raw = col.accessor
          ? col.accessor(row)
          : (row as any)[col.key as string];
        const val = raw == null ? '-' : String(raw);

        doc.text(val, xCursor + 3, finalRowY, {
          width: w - 6,
          align: col.align ?? 'left',
          lineBreak: false,
          ellipsis: true,
        });
        xCursor += w;
      });

      doc.y = finalRowY + 14;

      if (borderMode === 'horizontal' || borderMode === 'full') {
        doc
          .moveTo(this.PAGE_MARGIN, doc.y - 2)
          .lineTo(this.PAGE_WIDTH - this.PAGE_MARGIN, doc.y - 2)
          .lineWidth(0.3)
          .strokeColor('#ddd')
          .stroke();
      }
    };

    drawHeader();
    for (const row of options.rows) {
      drawRow(row);
    }

    doc.moveDown(1);
  }

  /**
   * Table STYLED (Poin 4 aggregate): header biru-putih + striping + repeat
   * header di page break. Konsisten dengan frontend table styling.
   */
  addStyledTable<T = any>(
    doc: PDFKit.PDFDocument,
    options: PdfStyledTableOptions<T>,
  ): void {
    const cols = options.columns;
    const usableWidth = this.PAGE_WIDTH - this.PAGE_MARGIN * 2;
    const headerColor = options.headerColor ?? this.BRAND_COLOR;
    const stripeColor = options.stripeColor ?? this.STRIPE_COLOR;
    const repeatHeader = options.repeatHeader !== false;
    const rowHeight = 22;
    const headerHeight = 24;

    const colWidths = cols.map((c) => c.width ?? usableWidth / cols.length);

    const drawHeader = () => {
      const headerY = doc.y;

      // Header bg
      doc
        .rect(this.PAGE_MARGIN, headerY, usableWidth, headerHeight)
        .fill(headerColor);

      // Header text
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff');

      let xCursor = this.PAGE_MARGIN;
      cols.forEach((col, i) => {
        doc.text(
          String(col.label),
          xCursor + 6,
          headerY + 8,
          {
            width: colWidths[i] - 12,
            align: col.align ?? 'left',
            lineBreak: false,
          },
        );
        xCursor += colWidths[i];
      });

      doc.fillColor('#000');
      doc.y = headerY + headerHeight;
    };

    // Top border (di atas header)
    const drawTableTopBorder = () => {
      doc
        .moveTo(this.PAGE_MARGIN, doc.y)
        .lineTo(this.PAGE_WIDTH - this.PAGE_MARGIN, doc.y)
        .lineWidth(0.5)
        .strokeColor(headerColor)
        .stroke();
    };

    drawHeader();
    drawTableTopBorder();

    options.rows.forEach((row, idx) => {
      // Page break check
      if (doc.y > this.PAGE_HEIGHT - this.PAGE_MARGIN - 40) {
        doc.addPage();
        if (repeatHeader) {
          drawHeader();
          drawTableTopBorder();
        }
      }

      const rowY = doc.y;

      // Striping (odd index = light bg)
      if (idx % 2 === 1) {
        doc
          .rect(this.PAGE_MARGIN, rowY, usableWidth, rowHeight)
          .fill(stripeColor);
      }

      doc.font('Helvetica').fontSize(9).fillColor('#000');

      let xCursor = this.PAGE_MARGIN;
      cols.forEach((col, i) => {
        const raw = col.accessor
          ? col.accessor(row)
          : (row as any)[col.key as string];
        const val = raw == null ? '-' : String(raw);

        const key = (col.key as string).toLowerCase();
        const isStatusBersih = key === 'status' && val === 'BERSIH';
        if (isStatusBersih) {
          doc.fillColor('#16a34a').font('Helvetica-Bold');
        }

        doc.text(val, xCursor + 6, rowY + 7, {
          width: colWidths[i] - 12,
          align: col.align ?? 'left',
          lineBreak: false,
        });

        if (isStatusBersih) {
          doc.fillColor('#000').font('Helvetica');
        }

        xCursor += colWidths[i];
      });

      doc.y = rowY + rowHeight;

      // Row separator (light gray)
      doc
        .moveTo(this.PAGE_MARGIN, doc.y)
        .lineTo(this.PAGE_WIDTH - this.PAGE_MARGIN, doc.y)
        .lineWidth(0.3)
        .strokeColor('#e5e7eb')
        .stroke();
    });

    // Outer bottom border (header color)
    doc
      .moveTo(this.PAGE_MARGIN, doc.y)
      .lineTo(this.PAGE_WIDTH - this.PAGE_MARGIN, doc.y)
      .lineWidth(0.5)
      .strokeColor(headerColor)
      .stroke();

    doc.moveDown(0.8);
  }

  /**
   * Signature section STANDAR: 2 kolom sejajar di bagian bawah, tanpa border box.
   */
  addSignatureSection(
    doc: PDFKit.PDFDocument,
    options: PdfSignatureOptions,
  ): void {
    if (doc.y > this.PAGE_HEIGHT - this.PAGE_MARGIN - 140) {
      doc.addPage();
    }

    if (options.intro) {
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#000')
        .text(options.intro, { align: 'left' });
      doc.moveDown(1);
    }

    const usableWidth = this.PAGE_WIDTH - this.PAGE_MARGIN * 2;
    const colWidth = usableWidth / options.signers.length;
    const startY = doc.y;
    const labelY = startY + 18;
    const nameY = startY + 70;
    const roleY = startY + 84;

    options.signers.forEach((signer, i) => {
      const x = this.PAGE_MARGIN + i * colWidth;

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#000')
        .text(signer.role, x + colWidth / 2, startY, {
          width: colWidth,
          align: 'center',
        });

      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor('#999')
        .text(signer.placeholder ?? '(......................)', x, labelY, {
          width: colWidth,
          align: 'center',
        });

      const lineY = labelY + 25;
      doc
        .moveTo(x + 10, lineY)
        .lineTo(x + colWidth - 10, lineY)
        .lineWidth(0.5)
        .strokeColor('#000')
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#000')
        .text(signer.name, x, nameY, {
          width: colWidth,
          align: 'center',
        });

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#555')
        .text(signer.role, x, roleY, {
          width: colWidth,
          align: 'center',
        });
    });

    doc.y = roleY + 30;
  }

  /**
   * Signature Box STYLED (Poin 4 aggregate): bordered box per signer dengan
   * role + signature line + name + role di dalam box. Default Posisi: kanan.
   */
  addSignatureBox(
    doc: PDFKit.PDFDocument,
    signers: PdfSignatureSigner[],
    options?: { position?: 'left' | 'right' | 'center' },
  ): void {
    if (doc.y > this.PAGE_HEIGHT - this.PAGE_MARGIN - 110) {
      doc.addPage();
    }

    const position = options?.position ?? 'right';
    const usableWidth = this.PAGE_WIDTH - this.PAGE_MARGIN * 2;
    const boxGap = 20;
    const boxHeight = 80;

    // Intro kalau ada
    if (signers.length === 1) {
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor('#555')
        .text(
          'Dokumen ini dicetak otomatis oleh sistem sebagai bukti daftar vendor bersih pelanggaran:',
          this.PAGE_MARGIN,
          doc.y,
          { width: usableWidth, align: 'left' },
        );
      doc.moveDown(0.5);
    }

    const startY = doc.y + 5;
    const boxWidth =
      signers.length === 1
        ? usableWidth * 0.4
        : (usableWidth - boxGap * (signers.length - 1)) / signers.length;

    signers.forEach((signer, i) => {
      let x: number;
      if (signers.length === 1 && position === 'right') {
        x = this.PAGE_WIDTH - this.PAGE_MARGIN - boxWidth;
      } else if (position === 'center') {
        const totalWidth = boxWidth * signers.length + boxGap * (signers.length - 1);
        x = this.PAGE_MARGIN + (usableWidth - totalWidth) / 2 + i * (boxWidth + boxGap);
      } else {
        x = this.PAGE_MARGIN + i * (boxWidth + boxGap);
      }

      // Box border
      doc
        .rect(x, startY, boxWidth, boxHeight)
        .lineWidth(0.5)
        .strokeColor('#888')
        .stroke();

      // Role (top, bold)
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#333')
        .text(signer.role.toUpperCase(), x + 6, startY + 6, {
          width: boxWidth - 12,
          align: 'center',
        });

      // Placeholder italic (above signature line)
      const sigLineY = startY + 48;
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor('#999')
        .text(
          signer.placeholder ?? '(......................)',
          x + 10,
          sigLineY - 14,
          { width: boxWidth - 20, align: 'center' },
        );

      // Signature line
      doc
        .moveTo(x + 10, sigLineY)
        .lineTo(x + boxWidth - 10, sigLineY)
        .lineWidth(0.5)
        .strokeColor('#000')
        .stroke();

      // Name (below line)
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#000')
        .text(signer.name, x + 10, sigLineY + 6, {
          width: boxWidth - 20,
          align: 'center',
        });

      // Role (bottom, smaller)
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#555')
        .text(signer.role, x + 10, sigLineY + 20, {
          width: boxWidth - 20,
          align: 'center',
        });
    });

    doc.y = startY + boxHeight + 10;
  }

  /**
   * Bind footer (timestamp + page number) ke SETIAP halaman. PENTING:
   * harus dipanggil SETELAH semua halaman ditambah (di dalam pipeAndSave)
   * supaya bufferedPageRange() akurat.
   */
  private bindFooter(doc: PDFKit.PDFDocument, generatedAt: Date): void {
    const range = doc.bufferedPageRange();
    const generatedStr =
      generatedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      const footerY = this.PAGE_HEIGHT - this.PAGE_MARGIN;

      // Accent line (biru tua)
      doc
        .moveTo(this.PAGE_MARGIN, footerY - 10)
        .lineTo(this.PAGE_WIDTH - this.PAGE_MARGIN, footerY - 10)
        .lineWidth(0.5)
        .strokeColor(this.BRAND_COLOR)
        .stroke();

      // Generated timestamp (kiri, abu-abu)
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#666')
        .text(
          `Generated: ${generatedStr}`,
          this.PAGE_MARGIN,
          footerY,
          { lineBreak: false, width: 250 },
        );

      // Page number (kanan, brand color, bold)
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(this.BRAND_COLOR)
        .text(
          `Halaman ${i - range.start + 1} dari ${range.count}`,
          this.PAGE_WIDTH - this.PAGE_MARGIN - 150,
          footerY,
          { lineBreak: false, width: 150, align: 'right' },
        );

      doc.fillColor('#000');
    }
  }

  /**
   * Pipe doc ke file stream + resolve setelah file selesai ditulis.
   * Sekarang menerima generatedAt (opsional) — kalau ada, footer (timestamp +
   * page number) akan di-render SETELAH semua content ditulis dan SEBELUM
   * pipe, supaya bufferedPageRange akurat dan footer muncul di setiap halaman.
   */
  pipeAndSave(
    doc: PDFKit.PDFDocument,
    filePath: string,
    generatedAt?: Date,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fs = require('fs');
      const path = require('path');

      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Render footer kalau generatedAt diberikan — SETELAH semua content
      // ditulis, supaya page range akurat.
      if (generatedAt) {
        this.bindFooter(doc, generatedAt);
      }

      const stream = fs.createWriteStream(filePath);
      stream.on('finish', () => resolve());
      stream.on('error', (err: Error) => reject(err));

      doc.pipe(stream);
      doc.end();
    });
  }
}