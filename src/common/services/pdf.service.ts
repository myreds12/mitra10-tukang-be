import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');

/**
 * Reusable PDF builder untuk Poin 3 (Penalty Receipt) dan Poin 4
 * (No Violation Certificate). Memakai pdfkit (pure Node, tidak butuh
 * headless browser — sesuai requirement deployment sederhana).
 *
 * Font: pdfkit built-in Helvetica (mendukung Latin-1 / WinAnsi).
 * Karakter Indonesia TANPA diakritik ("Pelanggaran", "Vendor", "Bukti",
 * "Quartal", "Tanggal") aman. Kalau di masa depan butuh huruf dengan
 * diakritik (mis. "Dépan", "Kafé"), tambahkan font TTF via doc.registerFont().
 *
 * Logo: placeholder teks "MITRA10" — kalau ada asset logo final nanti,
 * override method addHeader() atau pakai sharp untuk embed image.
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

@Injectable()
export class PdfService {
  private readonly PAGE_MARGIN = 40;
  private readonly PAGE_WIDTH = 595.28; // A4
  private readonly PAGE_HEIGHT = 841.89; // A4

  /**
   * Buat PDF document baru + bind footer (page number + generated date).
   * Caller wajib memanggil pipeAndSave() atau doc.end() setelah menulis isi.
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

    this.bindFooter(doc, generatedAt);
    return doc;
  }

  /**
   * Header: logo placeholder "MITRA10" + judul + sub-judul.
   */
  addHeader(doc: PDFKit.PDFDocument, options: PdfHeaderOptions): void {
    const startY = doc.y;

    // Logo placeholder (text). Tinggi jika asset logo, ganti block ini dengan
    // sharp(buffer).toBuffer() lalu doc.image().
    doc
      .fillColor('#1a4789')
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

    // Title (centered, bold)
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

    // Garis pemisah
    doc
      .moveTo(this.PAGE_MARGIN, doc.y + 8)
      .lineTo(this.PAGE_WIDTH - this.PAGE_MARGIN, doc.y + 8)
      .lineWidth(0.5)
      .strokeColor('#ccc')
      .stroke();

    doc.moveDown(1.2);
  }

  /**
   * Section block: judul + body lines. Berguna untuk blok info vendor.
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
   * Table helper — sederhana, multi-kolom dengan header + body.
   * Auto page-break jika overflow. Row tinggi tetap (single-line assumption).
   */
  addTable<T = any>(doc: PDFKit.PDFDocument, options: PdfTableOptions<T>): void {
    const cols = options.columns;
    const usableWidth = this.PAGE_WIDTH - this.PAGE_MARGIN * 2;
    const borderMode = options.border ?? 'horizontal';

    // Default equal-width kalau width tidak diisi
    const colWidths = cols.map((c) => c.width ?? usableWidth / cols.length);

    const drawHeader = () => {
      const headerY = doc.y;
      let xCursor = this.PAGE_MARGIN;

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff');

      if (borderMode === 'full') {
        doc
          .rect(this.PAGE_MARGIN, headerY - 2, usableWidth, 16)
          .fill('#1a4789');
      } else {
        doc
          .rect(this.PAGE_MARGIN, headerY - 2, usableWidth, 16)
          .fill('#1a4789');
      }

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

      // Page break check
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

      // Row separator (horizontal mode)
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
   * Signature section: 2 kolom (atau lebih) sejajar di bagian bawah.
   * Auto page-break jika tidak cukup ruang di halaman sekarang.
   */
  addSignatureSection(
    doc: PDFKit.PDFDocument,
    options: PdfSignatureOptions,
  ): void {
    // Estimate space needed: ~120pt untuk area ttd
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
    const labelY = startY + 18; // untuk placeholder "Tanda tangan"
    const nameY = startY + 70; // untuk nama di bawah garis
    const roleY = startY + 84;

    options.signers.forEach((signer, i) => {
      const x = this.PAGE_MARGIN + i * colWidth;

      // Nama jabatan di atas (opsional, biasanya sudah ada di intro)
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#000')
        .text(signer.role, x + colWidth / 2, startY, {
          width: colWidth,
          align: 'center',
        });

      // Placeholder tanda tangan
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor('#999')
        .text(signer.placeholder ?? '(......................)', x, labelY, {
          width: colWidth,
          align: 'center',
        });

      // Garis bawah tanda tangan
      const lineY = labelY + 25;
      doc
        .moveTo(x + 10, lineY)
        .lineTo(x + colWidth - 10, lineY)
        .lineWidth(0.5)
        .strokeColor('#000')
        .stroke();

      // Nama penandatangan
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#000')
        .text(signer.name, x, nameY, {
          width: colWidth,
          align: 'center',
        });

      // Role/jabatan di bawah nama
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
   * Bind footer (page number + generated date) ke setiap halaman yang ditambah.
   */
  private bindFooter(
    doc: PDFKit.PDFDocument,
    generatedAt: Date,
  ): void {
    const range = doc.bufferedPageRange();
    const generatedStr = generatedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      const footerY = this.PAGE_HEIGHT - this.PAGE_MARGIN;

      doc
        .moveTo(this.PAGE_MARGIN, footerY - 5)
        .lineTo(this.PAGE_WIDTH - this.PAGE_MARGIN, footerY - 5)
        .lineWidth(0.3)
        .strokeColor('#ccc')
        .stroke();

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

      doc.text(
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
   */
  pipeAndSave(
    doc: PDFKit.PDFDocument,
    filePath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const fs = require('fs');
      const path = require('path');

      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const stream = fs.createWriteStream(filePath);
      stream.on('finish', () => resolve());
      stream.on('error', (err: Error) => reject(err));

      doc.pipe(stream);
      doc.end();
    });
  }
}