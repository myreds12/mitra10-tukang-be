/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../common/services/pdf.service';
import { ReportQueryHelper } from './helpers/report-query.helper';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class VendorSpPdfService {
  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
    private readonly reportQuery: ReportQueryHelper,
  ) {}

  private getSpStatusText(level: number): string {
    const statusMap: Record<number, string> = {
      1: 'SP1',
      2: 'SP2',
      3: 'SP3',
    };
    return statusMap[level] || 'UNKNOWN';
  }

  // POIN 3: PDF REKAP PENALTY (Bukti SP)
  // ================================

  /**
   * Generate PDF Bukti Surat Peringatan untuk vendor di quarter tertentu.
   * - 404 kalau vendor tidak ditemukan / sudah dihapus
   * - PDF berisi info vendor, ringkasan, rincian pelanggaran (kalau ada),
   *   dan section tanda tangan Admin HO + Vendor.
   * - Audit log dicatat ke tabel logs (module_type='EXPORT_PDF_PENALTY').
   */
  async generatePenaltyReceiptPdf(
    vendorId: number,
    quarter: number,
    year: number,
    generatedBy?: number,
  ): Promise<{ filePath: string; userFileName: string }> {
    // 1. Vendor harus ada
    const vendor = await this.dbService.vendor.findFirst({
      where: { id: vendorId, deleted_at: null },
      select: {
        id: true,
        company_name: true,
        pic_name: true,
        email_address: true,
        is_active: true,
      },
    });
    if (!vendor) {
      throw new NotFoundException(
        `Vendor dengan ID ${vendorId} tidak ditemukan atau sudah dihapus.`,
      );
    }

    // 2. Lookup SP di kuartal tsb (kalau ada)
    const sp = await this.reportQuery.getSpByVendorAndQuarter(
      vendorId,
      quarter,
      year,
    );

    // 3. Rincian pelanggaran aktif di quarter
    const violations = await this.reportQuery.getViolationLogDetails(
      vendorId,
      quarter,
      year,
    );

    // 4. Total order di quarter (seluruh order)
    const totalOrders = await this.reportQuery.countVendorOrdersInQuarter(
      vendorId,
      quarter,
      year,
    );

    // 5. Hitung agregat
    const totalPenaltyPoints = violations.reduce((sum, v) => {
      const effective = v.adjusted_point ?? v.violation_type?.point ?? 0;
      return sum + effective;
    }, 0);
    const uniqueOrderIds = new Set(
      violations.map((v) => v.order_id).filter((id): id is number => id != null),
    );
    const totalPenaltyOrders = uniqueOrderIds.size;

    // 6. Build PDF
    const generatedAt = new Date();
    const doc = this.pdfService.createDocument(generatedAt);
    this.pdfService.addHeader(doc, {
      title: 'BUKTI SURAT PERINGATAN (SP)',
      subtitle: `Periode Q${quarter} ${year}`,
    });

    this.pdfService.addSection(doc, 'Informasi Vendor', [
      { label: 'Nama Perusahaan', value: vendor.company_name },
      { label: 'PIC', value: vendor.pic_name },
      { label: 'Status Vendor', value: vendor.is_active ? 'AKTIF' : 'NONAKTIF' },
      {
        label: 'Status SP',
        value: sp ? this.getSpStatusText(sp.sp_level) : 'NORMAL',
      },
    ]);

    this.pdfService.addSection(doc, 'Ringkasan', [
      { label: 'Tanggal Dokumen', value: generatedAt.toISOString().slice(0, 10) },
      { label: 'Total Order Kuartal Ini', value: String(totalOrders) },
      { label: 'Total Order Pelanggaran', value: String(totalPenaltyOrders) },
      { label: 'Total Poin Penalty', value: String(totalPenaltyPoints) },
      {
        label: 'Alokasi Order Dikurangi',
        value: sp?.allocation_reduction
          ? `${sp.allocation_reduction}%`
          : 'Tidak ada pengurangan',
      },
    ]);

    // Tabel rincian pelanggaran (hanya kalau ada)
    if (violations.length > 0) {
      this.pdfService.addSection(doc, 'Rincian Pelanggaran', []);
      this.pdfService.addTable(doc, {
        columns: [
          {
            key: 'tanggal',
            label: 'Tanggal',
            width: 80,
            accessor: (r: any) =>
              r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '-',
          },
          {
            key: 'kode',
            label: 'Kode',
            width: 70,
            accessor: (r: any) => r.violation_type?.code ?? '-',
          },
          {
            key: 'nama',
            label: 'Nama Pelanggaran',
            width: 160,
            accessor: (r: any) => r.violation_type?.name ?? '-',
          },
          {
            key: 'order',
            label: 'Order',
            width: 90,
            accessor: (r: any) =>
              r.orders?.project_number
                ? `#${r.orders.project_number}`
                : r.order_id
                ? `#${r.order_id}`
                : '-',
          },
          {
            key: 'poin',
            label: 'Poin',
            width: 50,
            align: 'right',
            accessor: (r: any) =>
              String(r.adjusted_point ?? r.violation_type?.point ?? 0),
          },
        ],
        rows: violations,
      });
    } else {
      this.pdfService.addSection(doc, 'Rincian Pelanggaran', [
        { label: 'Catatan', value: 'Tidak ada pelanggaran aktif di kuartal ini.' },
      ]);
    }

    // Tanda tangan
    this.pdfService.addSignatureSection(doc, {
      intro: 'Surat ini ditandatangani oleh:',
      signers: [
        {
          name: '(Admin HO)',
          role: 'Head Office',
          placeholder: 'Tanda tangan & cap',
        },
        {
          name: vendor.pic_name || '(Vendor)',
          role: vendor.company_name,
          placeholder: 'Tanda tangan',
        },
      ],
    });

    // 7. Save file dengan nama unik
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19); // YYYY-MM-DDTHH-MM-SS
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    const fileName = `penalty-${vendorId}-${quarter}-${year}-${ts}-${rand}.pdf`;
    const folder = path.resolve('./storage/pdf/vendor-sp');
    const filePath = path.join(folder, fileName);
    await this.pdfService.pipeAndSave(doc, filePath, generatedAt);

    // 8. User-facing filename (dikirim via Content-Disposition)
    const safeVendorName = (vendor.company_name || 'Vendor')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 40);
    const userFileName = `Bukti_SP_${safeVendorName}_${quarter}_${year}.pdf`;

    // 9. Audit log (best-effort, jangan gagalkan export kalau audit gagal)
    try {
      await this.dbService.logs.create({
        data: {
          module_type: 'EXPORT_PDF_PENALTY',
          module_id: sp?.id ?? null,
          issuer_type: 'USER',
          issuer_id: generatedBy ?? null,
          properties: JSON.stringify({
            vendor_id: vendorId,
            quarter,
            year,
            total_orders: totalOrders,
            total_penalty_orders: totalPenaltyOrders,
            total_points: totalPenaltyPoints,
            sp_level: sp?.sp_level ?? null,
            file_path: filePath,
            file_name: fileName,
            user_file_name: userFileName,
          }),
        },
      });
    } catch (auditError) {
      // eslint-disable-next-line no-console
      console.error(
        `[vendor-sp] audit log failed for penalty receipt vendor=${vendorId} Q${quarter}/${year} reason=${(auditError as Error)?.message ?? auditError}`,
      );
    }

    return { filePath, userFileName };
  }

  // ================================
  // POIN 4: PDF REKAP VENDOR TANPA PELANGGARAN (Surat Bebas)
  // ================================

  /**
   * Generate PDF Surat Keterangan Bebas Pelanggaran.
   * Validasi WAJIB:
   * - Vendor tidak punya pelanggaran AKTIF di quarter tsb (kalau ada → 400).
   * - Quarter harus lampau, bukan yang sedang berjalan (kalau current/past → 400).
   * - Auto-increment nomor surat: BEBAS-<year>-<sequence> dari jumlah audit
   *   logs module_type='EXPORT_PDF_NO_VIOLATION' di tahun tsb.
   */
  async generateNoViolationCertificatePdf(
    vendorId: number,
    quarter: number,
    year: number,
    generatedBy?: number,
  ): Promise<{ filePath: string; userFileName: string }> {
    // 1. Vendor harus ada
    const vendor = await this.dbService.vendor.findFirst({
      where: { id: vendorId, deleted_at: null },
      select: {
        id: true,
        company_name: true,
        pic_name: true,
        email_address: true,
        is_active: true,
      },
    });
    if (!vendor) {
      throw new NotFoundException(
        `Vendor dengan ID ${vendorId} tidak ditemukan atau sudah dihapus.`,
      );
    }

    // 2. Validasi: TIDAK BOLEH ada pelanggaran aktif di quarter tsb
    const activeViolations = await this.reportQuery.getViolationLogDetails(
      vendorId,
      quarter,
      year,
    );
    if (activeViolations.length > 0) {
      throw new BadRequestException(
        `Vendor memiliki ${activeViolations.length} pelanggaran pada Q${quarter} ${year}, tidak bisa cetak bukti tanpa pelanggaran. Selesaikan atau arsipkan pelanggaran tersebut terlebih dahulu.`,
      );
    }

    // 3. Validasi: quarter harus lampau (bukan yang sedang berjalan)
    const now = new Date();
    if (!this.reportQuery.isPastQuarter(quarter, year, now)) {
      const current = this.reportQuery.getCurrentQuarterInfo(now);
      throw new BadRequestException(
        `Q${quarter} ${year} adalah kuartal yang sedang berjalan (saat ini Q${current.quarter} ${current.year}). Surat bebas pelanggaran hanya bisa dicetak untuk kuartal lampau.`,
      );
    }

    // 4. Total order di quarter (seluruh order, bukan cuma yg kena penalty)
    const totalOrders = await this.reportQuery.countVendorOrdersInQuarter(
      vendorId,
      quarter,
      year,
    );

    // 5. Auto-increment nomor surat dari logs table
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);
    const sequenceCount = await this.dbService.logs.count({
      where: {
        module_type: 'EXPORT_PDF_NO_VIOLATION',
        created_at: { gte: yearStart, lt: yearEnd },
      },
    });
    const sequence = String(sequenceCount + 1).padStart(4, '0');
    const letterNumber = `BEBAS-${year}-${sequence}`;

    // 6. Build PDF
    const generatedAt = new Date();
    const doc = this.pdfService.createDocument(generatedAt);
    this.pdfService.addHeader(doc, {
      title: 'SURAT KETERANGAN BEBAS PELANGGARAN',
      subtitle: `Nomor: ${letterNumber}    Periode: Q${quarter} ${year}`,
    });

    this.pdfService.addSection(doc, 'Informasi Vendor', [
      { label: 'Nama Perusahaan', value: vendor.company_name },
      { label: 'PIC', value: vendor.pic_name },
      { label: 'Email', value: vendor.email_address ?? '-' },
      { label: 'Status Vendor', value: vendor.is_active ? 'AKTIF' : 'NONAKTIF' },
    ]);

    this.pdfService.addSection(doc, 'Keterangan', [
      { label: 'Total Order Kuartal', value: String(totalOrders) },
      { label: 'Total Pelanggaran', value: '0 (nol)' },
      { label: 'Status SP', value: 'NORMAL' },
    ]);

    // Statement text resmi
    doc.moveDown(0.5);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#000')
      .text(
        `Dengan ini PT Mitra10 memberikan keterangan bahwa vendor di atas tidak memiliki ` +
          `pelanggaran aktif pada periode Q${quarter} ${year}. ` +
          `Surat keterangan ini dibuat untuk dipergunakan sebagaimana mestinya.`,
        { align: 'justify', width: 480 },
      );
    doc.moveDown(2);

    // Tanda tangan
    this.pdfService.addSignatureSection(doc, {
      intro: 'Surat ini ditandatangani oleh:',
      signers: [
        {
          name: '(Admin HO)',
          role: 'Head Office',
          placeholder: 'Tanda tangan & cap',
        },
      ],
    });

    // 7. Save file
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    const fileName = `no-violation-${vendorId}-${quarter}-${year}-${ts}-${rand}.pdf`;
    const folder = path.resolve('./storage/pdf/vendor-sp');
    const filePath = path.join(folder, fileName);
    await this.pdfService.pipeAndSave(doc, filePath, generatedAt);

    // 8. User-facing filename
    const safeVendorName = (vendor.company_name || 'Vendor')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 40);
    const userFileName = `Surat_Bebas_Pelanggaran_${safeVendorName}_${quarter}_${year}.pdf`;

    // 9. Audit log
    try {
      await this.dbService.logs.create({
        data: {
          module_type: 'EXPORT_PDF_NO_VIOLATION',
          module_id: null,
          issuer_type: 'USER',
          issuer_id: generatedBy ?? null,
          properties: JSON.stringify({
            vendor_id: vendorId,
            quarter,
            year,
            letter_number: letterNumber,
            total_orders: totalOrders,
            file_path: filePath,
            file_name: fileName,
            user_file_name: userFileName,
          }),
        },
      });
    } catch (auditError) {
      // eslint-disable-next-line no-console
      console.error(
        `[vendor-sp] audit log failed for no-violation cert vendor=${vendorId} Q${quarter}/${year} reason=${(auditError as Error)?.message ?? auditError}`,
      );
    }

    return { filePath, userFileName };
  }

  /**
   * Poin 4 (varian aggregate): PDF rekap LIST vendor tanpa pelanggaran pada
   * quarter tsb. Bukan per-vendor certificate — ini bukti aggregate untuk
   * audit/compliance. Filter opsional: category (lihat helper untuk semantik).
   */
  async generateCleanVendorRecapPdf(
    quarter: number,
    year: number,
    category: string | undefined,
    generatedBy?: number,
  ): Promise<{ filePath: string; userFileName: string }> {
    const cleanVendors = await this.reportQuery.getVendorsWithZeroViolations(
      quarter,
      year,
      category,
    );

    const generatedAt = new Date();
    const doc = this.pdfService.createDocument(generatedAt);

    const catPart = category ? `-${category.toLowerCase()}` : '';

    this.pdfService.addStyledHeader(doc, {
      title: 'REKAP VENDOR TANPA PELANGGARAN',
      subtitle: `Periode Q${quarter} ${year}${category ? `    |    Kategori: ${category}` : ''}    |    Total vendor bersih: ${cleanVendors.length}`,
      documentNo: `CLEAN-RECAP-Q${quarter}-${year}${catPart}`,
    });

    this.pdfService.addInfoBox(doc, 'Informasi Dokumen', [
      { label: 'Tanggal Generate', value: generatedAt.toISOString().slice(0, 10) },
      { label: 'Quartal', value: `Q${quarter} ${year}` },
      { label: 'Kategori Filter', value: category ?? 'Semua kategori' },
      { label: 'Total Vendor Bersih', value: String(cleanVendors.length) },
    ]);

    if (cleanVendors.length === 0) {
      this.pdfService.addInfoBox(doc, 'Daftar Vendor', [
        {
          label: 'Catatan',
          value: 'Tidak ada vendor tanpa pelanggaran pada periode ini.',
        },
      ]);
    } else {
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#183383')
        .text('Daftar Vendor Bersih');
      doc.moveDown(0.4);

      const rows = cleanVendors.map((v, i) => ({ no: i + 1, ...v }));
      this.pdfService.addStyledTable(doc, {
        columns: [
          {
            key: 'no',
            label: 'No',
            width: 30,
            align: 'center',
            accessor: (r: any) => String(r.no),
          },
          {
            key: 'company',
            label: 'Nama Perusahaan',
            width: 200,
            accessor: (r: any) => r.company_name,
          },
          {
            key: 'pic',
            label: 'PIC',
            width: 110,
            accessor: (r: any) => r.pic_name ?? '-',
          },
          {
            key: 'orders',
            label: 'Total Order',
            width: 70,
            align: 'right',
            accessor: (r: any) => String(r.total_orders),
          },
          {
            key: 'status',
            label: 'Status',
            width: 80,
            align: 'center',
            accessor: () => 'BERSIH',
          },
        ],
        rows,
        repeatHeader: true,
      });
    }

    this.pdfService.addSignatureBox(doc, [
      {
        name: '(Admin HO)',
        role: 'Head Office',
        placeholder: 'Tanda tangan & cap',
      },
    ], { position: 'right' });

    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const rand = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    const fileName = `clean-recap-${quarter}-${year}${catPart}-${ts}-${rand}.pdf`;
    const folder = path.resolve('./storage/pdf/vendor-sp');
    const filePath = path.join(folder, fileName);
    await this.pdfService.pipeAndSave(doc, filePath, generatedAt);

    const userFileName = `Rekap_Vendor_Bersih_Q${quarter}_${year}${category ? '_' + category : ''}.pdf`;

    try {
      await this.dbService.logs.create({
        data: {
          module_type: 'EXPORT_PDF_CLEAN_VENDOR_RECAP',
          module_id: null,
          issuer_type: 'USER',
          issuer_id: generatedBy ?? null,
          properties: JSON.stringify({
            quarter,
            year,
            category: category ?? null,
            total_clean_vendors: cleanVendors.length,
            file_path: filePath,
            file_name: fileName,
            user_file_name: userFileName,
          }),
        },
      });
    } catch (auditError) {
      // eslint-disable-next-line no-console
      console.error(
        `[vendor-sp] audit log failed for clean vendor recap Q${quarter}/${year} reason=${(auditError as Error)?.message ?? auditError}`,
      );
    }

    return { filePath, userFileName };
  }

  // ==========================================
  // [POIN 7] WEEKLY SP WARNING NOTIFICATIONS
  // ==========================================

  /**
   * [POIN 7] Dapatkan daftar vendor yang total poin penalty-nya mendekati threshold SP berikutnya (>= 70%)
   * dan belum dikirimkan notifikasi peringatan pada minggu ISO berjalan (idempotent).
   *
   * @param quarter Kuartal (1-4). Jika tidak diisi, gunakan kuartal berjalan dari checkDate.
   * @param year Tahun (e.g. 2026). Jika tidak diisi, gunakan tahun berjalan dari checkDate.
   * @param checkDate Tanggal acuan (default: new Date()) untuk evaluasi minggu ISO & status SP aktif.
   */
}
