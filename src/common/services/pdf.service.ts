import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
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
  /** Label header di atas kotak (mis. "PIHAK VENDOR", "PIHAK MITRA10"). */
  header?: string;
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
  /** Jumlah kolom pasangan label-value (1 atau 2). Default 1. */
  columns?: 1 | 2;
  /** Margin bawah setelah info box (pt). Default 8. */
  marginBottom?: number;
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

  private getMitraLogoPath(): string | undefined {
    const logoPath = path.resolve(
      process.cwd(),
      'templates',
      'public',
      'img',
      'logo-mitra.png',
    );

    return fs.existsSync(logoPath) ? logoPath : undefined;
  }

  /**
   * Buat PDF document baru. Footer TIDAK di-bind di sini (akan di-bind
   * di pipeAndSave setelah semua pages ada, supaya bufferedPageRange akurat).
   */
  createDocument(generatedAt: Date = new Date()): PDFKit.PDFDocument {
    const doc = new PDFDocument({
      size: 'A4',
      // Keep pages available until the footer is rendered. Without this,
      // switchToPage/bufferedPageRange can flush pages while the document is
      // still being assembled and footer rendering may create an extra page.
      bufferPages: true,
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

    const logoBoxWidth = 80;
    const logoBoxHeight = 36;
    doc
      .rect(this.PAGE_MARGIN, startY, logoBoxWidth, logoBoxHeight)
      .fill('#fff')
      .lineWidth(0.5)
      .strokeColor('#d1d5db')
      .stroke();

    const logoPath = this.getMitraLogoPath();
    if (logoPath) {
      doc.image(logoPath, this.PAGE_MARGIN + 3, startY + 3, {
        fit: [logoBoxWidth - 6, logoBoxHeight - 6],
        align: 'center',
        valign: 'center',
      });
    } else {
      doc
        .fillColor(this.BRAND_COLOR)
        .font('Helvetica-Bold')
        .fontSize(20)
        .text('M10', this.PAGE_MARGIN, startY + 9, {
          width: logoBoxWidth,
          align: 'center',
          lineBreak: false,
        });
    }

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
   * Header STYLED (Poin 4 aggregate Rekap Vendor Bersih): logo resmi +
   * judul besar + hr accent line biru. Konsisten dengan brand Mitra10.
   *
   */
  addStyledHeader(
    doc: PDFKit.PDFDocument,
    options: { title: string; subtitle?: string; documentNo?: string },
  ): void {
    const startY = doc.y;
    const usableWidth = this.PAGE_WIDTH - this.PAGE_MARGIN * 2;

    // Logo resmi. Fallback text menjaga PDF tetap dapat dibuat jika asset
    // tidak ikut ter-deploy pada environment tertentu.
    const logoBoxWidth = 80;
    const logoBoxHeight = 36;
    doc
      .rect(this.PAGE_MARGIN, startY, logoBoxWidth, logoBoxHeight)
      .fill('#fff')
      .lineWidth(0.5)
      .strokeColor('#d1d5db')
      .stroke();

    const logoPath = this.getMitraLogoPath();
    if (logoPath) {
      doc.image(logoPath, this.PAGE_MARGIN + 3, startY + 3, {
        fit: [logoBoxWidth - 6, logoBoxHeight - 6],
        align: 'center',
        valign: 'center',
      });
    } else {
      doc
        .fillColor(this.BRAND_COLOR)
        .font('Helvetica-Bold')
        .fontSize(20)
        .text('M10', this.PAGE_MARGIN, startY + 9, {
          width: logoBoxWidth,
          align: 'center',
          lineBreak: false,
        });
    }


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
    doc.x = this.PAGE_MARGIN;
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
    const columns = options?.columns ?? 1;
    const marginBottom = options?.marginBottom ?? 8;
    const titleBarHeight = 20;
    const rowHeight = 18;

    const startY = doc.y;

    // Title bar
    doc
      .rect(this.PAGE_MARGIN, startY, usableWidth, titleBarHeight)
      .fill(borderColor);
    doc
      .fillColor('#fff')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(title, this.PAGE_MARGIN + 8, startY + 5);

    const bodyStartY = startY + titleBarHeight;

    if (columns === 2) {
      const colWidth = usableWidth / 2;
      const labelW = colWidth * 0.38;
      const valueW = colWidth * 0.62 - 8;
      const rowCount = Math.ceil(items.length / 2);

      const rowHeights: number[] = [];
      for (let r = 0; r < rowCount; r++) {
        const left = items[r * 2];
        const right = items[r * 2 + 1];

        doc.font('Helvetica-Bold').fontSize(8.5);
        const h1 = left ? doc.heightOfString(left.label || '-', { width: labelW }) : 0;
        const h2 = right ? doc.heightOfString(right.label || '-', { width: labelW }) : 0;
        doc.font('Helvetica').fontSize(9);
        const h3 = left ? doc.heightOfString(left.value || '-', { width: valueW }) : 0;
        const h4 = right ? doc.heightOfString(right.value || '-', { width: valueW }) : 0;

        rowHeights.push(Math.max(rowHeight, h1, h2, h3, h4) + 4);
      }

      const bodyHeight = rowHeights.reduce((total, h) => total + h, 0) + 6;
      doc
        .rect(this.PAGE_MARGIN, bodyStartY, usableWidth, bodyHeight)
        .fill(bgColor);

      let curY = bodyStartY + 4;
      for (let r = 0; r < rowCount; r++) {
        const rh = rowHeights[r];
        const left = items[r * 2];
        const right = items[r * 2 + 1];

        if (left) {
          doc
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .fillColor('#555')
            .text(left.label, this.PAGE_MARGIN + 8, curY, {
              width: labelW,
              lineBreak: false,
            });
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#000')
            .text(left.value || '-', this.PAGE_MARGIN + 8 + labelW, curY, {
              width: valueW,
              lineBreak: false,
            });
        }

        if (right) {
          const rightX = this.PAGE_MARGIN + colWidth + 8;
          doc
            .font('Helvetica-Bold')
            .fontSize(8.5)
            .fillColor('#555')
            .text(right.label, rightX, curY, {
              width: labelW,
              lineBreak: false,
            });
          doc
            .font('Helvetica')
            .fontSize(9)
            .fillColor('#000')
            .text(right.value || '-', rightX + labelW, curY, {
              width: valueW,
              lineBreak: false,
            });
        }

        curY += rh;
      }

      doc.x = this.PAGE_MARGIN;
      doc.y = bodyStartY + bodyHeight + marginBottom;
      return;
    }

    const labelColWidth = usableWidth * 0.35;
    const itemHeights = items.map((item) => {
      const labelWidth = labelColWidth - 12;
      const valueWidth = usableWidth - labelColWidth - 16;

      doc.font('Helvetica-Bold').fontSize(9);
      const labelHeight = doc.heightOfString(item.label || '-', {
        width: labelWidth,
      });
      doc.font('Helvetica').fontSize(10);
      const valueHeight = doc.heightOfString(item.value || '-', {
        width: valueWidth,
      });

      return Math.max(rowHeight, labelHeight, valueHeight) + 4;
    });
    const bodyHeight = itemHeights.reduce((total, height) => total + height, 0) + 8;
    doc
      .rect(this.PAGE_MARGIN, bodyStartY, usableWidth, bodyHeight)
      .fill(bgColor);

    let itemY = bodyStartY + 4;
    items.forEach((item, idx) => {
      const currentRowHeight = itemHeights[idx];
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
        });

      itemY += currentRowHeight;
    });

    doc.x = this.PAGE_MARGIN;
    doc.y = bodyStartY + bodyHeight + marginBottom;
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

    // Pastikan cukup ruang untuk header dan minimal baris data agar header tidak terisolasi.
    const minInitialHeight = headerHeight + 45;
    if (doc.y + minInitialHeight > this.PAGE_HEIGHT - this.PAGE_MARGIN - 40) {
      doc.addPage();
    }

    drawHeader();
    drawTableTopBorder();

    options.rows.forEach((row, idx) => {
      const cells = cols.map((col) => {
        const raw = col.accessor
          ? col.accessor(row)
          : (row as any)[col.key as string];
        return raw == null ? '-' : String(raw);
      });
      const rowHeight = Math.max(
        22,
        ...cells.map((value, i) => {
          doc.font('Helvetica').fontSize(9);
          return doc.heightOfString(value, {
            width: colWidths[i] - 12,
            lineBreak: true,
          }) + 12;
        }),
      );

      // Page break check
      if (doc.y + rowHeight > this.PAGE_HEIGHT - this.PAGE_MARGIN - 40) {
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
        const val = cells[i];

        const key = (col.key as string).toLowerCase();
        const isStatusBersih = key === 'status' && val === 'BERSIH';
        if (isStatusBersih) {
          doc.fillColor('#16a34a').font('Helvetica-Bold');
        }

        doc.text(val, xCursor + 6, rowY + 7, {
          width: colWidths[i] - 12,
          align: col.align ?? 'left',
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
    doc.x = this.PAGE_MARGIN;
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
        .text(signer.role, x, startY, {
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
    options?: { position?: 'left' | 'right' | 'center'; intro?: string },
  ): void {
    const position = options?.position ?? 'right';
    const usableWidth = this.PAGE_WIDTH - this.PAGE_MARGIN * 2;
    const boxGap = 20;
    const boxWidth =
      signers.length === 1
        ? usableWidth * 0.4
        : (usableWidth - boxGap * (signers.length - 1)) / signers.length;

    const signerLayouts = signers.map((signer, i) => {
      const headerText =
        signer.header ??
        (signers.length === 2
          ? i === 0
            ? 'PIHAK VENDOR'
            : 'PIHAK MITRA10'
          : signer.role.toUpperCase());

      doc.font('Helvetica-Bold').fontSize(9);
      const headerHeight = doc.heightOfString(headerText, {
        width: boxWidth - 16,
      });

      const placeholderText = signer.placeholder ?? '(Tanda tangan & stempel)';
      doc.font('Helvetica-Oblique').fontSize(8);
      const placeholderHeight = doc.heightOfString(placeholderText, {
        width: boxWidth - 20,
      });

      doc.font('Helvetica-Bold').fontSize(9.5);
      const nameHeight = doc.heightOfString(signer.name, {
        width: boxWidth - 20,
      });

      doc.font('Helvetica').fontSize(8.5);
      const roleHeight = doc.heightOfString(signer.role, {
        width: boxWidth - 20,
      });

      return {
        signer,
        headerText,
        headerHeight,
        placeholderText,
        placeholderHeight,
        nameHeight,
        roleHeight,
      };
    });

    const maxHeaderHeight = Math.max(...signerLayouts.map((l) => l.headerHeight));
    const minSigAreaHeight = 44;
    const maxBottomHeight = Math.max(
      ...signerLayouts.map((l) => l.nameHeight + 2 + l.roleHeight),
    );

    const topPadding = 8;
    const bottomPadding = 8;
    const boxHeight = Math.max(
      100,
      topPadding + maxHeaderHeight + minSigAreaHeight + 6 + maxBottomHeight + bottomPadding,
    );

    if (doc.y > this.PAGE_HEIGHT - this.PAGE_MARGIN - boxHeight - 25) {
      doc.addPage();
    }

    if (options?.intro || signers.length === 1) {
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor('#555')
        .text(
          options?.intro ??
            'Dokumen ini dicetak otomatis oleh sistem sebagai bukti daftar vendor bersih pelanggaran:',
          this.PAGE_MARGIN,
          doc.y,
          { width: usableWidth, align: 'left' },
        );
      doc.moveDown(0.5);
    }

    const startY = doc.y + 4;
    const sigLineY = startY + topPadding + maxHeaderHeight + minSigAreaHeight;

    signerLayouts.forEach((layout, i) => {
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
        .strokeColor('#9ca3af')
        .stroke();

      // Header text (top, bold)
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#1f2937')
        .text(layout.headerText, x + 8, startY + topPadding, {
          width: boxWidth - 16,
          align: 'center',
        });

      // Placeholder italic (above signature line)
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor('#9ca3af')
        .text(layout.placeholderText, x + 10, sigLineY - 14, {
          width: boxWidth - 20,
          align: 'center',
        });

      // Signature line
      doc
        .moveTo(x + 12, sigLineY)
        .lineTo(x + boxWidth - 12, sigLineY)
        .lineWidth(0.5)
        .strokeColor('#374151')
        .stroke();

      // Name (below line)
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#111827')
        .text(layout.signer.name, x + 10, sigLineY + 6, {
          width: boxWidth - 20,
          align: 'center',
        });

      // Role / Company (bottom, smaller)
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#4b5563')
        .text(layout.signer.role, x + 10, sigLineY + 6 + layout.nameHeight + 2, {
          width: boxWidth - 20,
          align: 'center',
        });
    });

    doc.y = startY + boxHeight + 10;
    doc.x = this.PAGE_MARGIN;
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
      const page = doc.switchToPage(i);

      // The footer is intentionally below the content area. Temporarily
      // disable the page bottom margin so PDFKit does not treat the footer as
      // overflow and append a blank page while writing it.
      const originalBottomMargin = page.margins.bottom;
      page.margins.bottom = 0;

      try {
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
      } finally {
        page.margins.bottom = originalBottomMargin;
      }
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
