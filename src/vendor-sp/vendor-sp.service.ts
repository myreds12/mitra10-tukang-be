/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  QueryVendorSpDto,
  CreateVendorSpDto,
  UpdateVendorSpDto,
  ReactivateVendorDto,
} from './dto/vendor-sp.dto';
import { QueryReactivationLogDto } from './dto/query-reactivation-log.dto';
import { Prisma } from '@prisma/client';
import { SpStatus, SpLevel } from './enums/sp-status.enum';
import * as fs from 'fs';
import * as path from 'path';
import { PdfService } from '../common/services/pdf.service';
import { ReportQueryHelper } from './helpers/report-query.helper';

@Injectable()
export class VendorSpService {
  private spStatusCache: Map<number, { data: any; timestamp: number }> = new Map();
  private readonly SP_CACHE_TTL = 5 * 60 * 1000;

  private getCachedSpStatus(vendorId: number): any | null {
    const cached = this.spStatusCache.get(vendorId);
    if (cached && (Date.now() - cached.timestamp) < this.SP_CACHE_TTL) {
      return cached.data;
    }
    return null;
  }

  private setCachedSpStatus(vendorId: number, data: any): void {
    this.spStatusCache.set(vendorId, { data, timestamp: Date.now() });
  }

  constructor(
    private readonly dbService: PrismaService,
    private readonly pdfService: PdfService,
    private readonly reportQuery: ReportQueryHelper,
  ) {}

  /**
   * Resolve nama role user dari DB. Dipakai oleh controller untuk role-check
   * di handler (pola JWT-only + role-check manual, sama seperti Poin 2).
   */
  async getRoleName(userId?: number): Promise<string | null> {
    if (!userId) return null;
    const user = await this.dbService.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: { roles: { select: { name: true } } },
    });
    return user?.roles?.name ?? null;
  }

  // ================================
  // VENDOR SP CRUD
  // ================================

  async findAll(query: QueryVendorSpDto) {
    try {
      const {
        page = 1,
        take = 10,
        vendor_id,
        sp_level,
        status,
        quarter,
        year,
        date_from,
        date_to,
        search,
      } = query;
      const skip = page * take - take;

      const where: Prisma.vendor_spWhereInput = {
        deleted_at: null,
        ...(vendor_id ? { vendor_id } : {}),
        ...(sp_level ? { sp_level } : {}),
        ...(status ? { status } : {}),
        ...(quarter ? { quarter } : {}),
        ...(year ? { year } : {}),
        ...(date_from && date_to
          ? {
              created_at: {
                gte: new Date(date_from),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            }
          : {}),
        ...(search
          ? {
              vendor: {
                OR: [
                  { company_name: { contains: search } },
                  { pic_name: { contains: search } },
                ],
              },
            }
          : {}),
      };

      const [spList, total] = await Promise.all([
        this.dbService.vendor_sp.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: 'desc' },
          include: {
            vendor: {
              select: {
                id: true,
                company_name: true,
                pic_name: true,
                email_address: true,
                phone_number: true,
                is_active: true,
              },
            },
            sp_details: {
              include: {
                violation_log: {
                  include: {
                    violation_type: true,
                    orders: { select: { id: true, project_number: true } },
                  },
                },
              },
            },
          },
        }),
        this.dbService.vendor_sp.count({ where }),
      ]);

      return {
        data: spList,
        meta: { total, page, take, skip },
      };
    } catch (error) {
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const sp = await this.dbService.vendor_sp.findFirst({
        where: { id, deleted_at: null },
        include: {
          vendor: {
            select: {
              id: true,
              company_name: true,
              pic_name: true,
              email_address: true,
              phone_number: true,
              is_active: true,
            },
          },
          sp_details: {
            include: {
              violation_log: {
                include: {
                  violation_type: true,
                  orders: {
                    select: { id: true, project_number: true, status: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!sp) {
        throw new NotFoundException(`Surat Peringatan dengan ID ${id} tidak ditemukan.`);
      }

      return sp;
    } catch (error) {
      throw error;
    }
  }

  async findByVendor(vendorId: number) {
    try {
      const spList = await this.dbService.vendor_sp.findMany({
        where: {
          vendor_id: vendorId,
          deleted_at: null,
        },
        orderBy: { created_at: 'desc' },
        include: {
          sp_details: {
            include: {
              violation_log: {
                include: {
                  violation_type: true,
                },
              },
            },
          },
        },
      });

      return spList;
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // CHECK VENDOR SP STATUS
  // ================================

  async checkVendorSpStatus(vendorId: number) {
    const cached = this.getCachedSpStatus(vendorId);
    if (cached) return cached;

    const now = new Date();

    // Get active SP
    const activeSP = await this.dbService.vendor_sp.findFirst({
      where: {
        vendor_id: vendorId,
        status: { in: [SpStatus.ACTIVE, SpStatus.EXTENDED] }, // AKTIF or EXTENDED
        end_date: { gte: now },
      },
      orderBy: { sp_level: 'desc' },
      include: {
        vendor: {
          select: {
            id: true,
            company_name: true,
            pic_name: true,
            is_active: true,
          },
        },
      },
    });

    if (!activeSP) {
      const spHistoryCount = await this.dbService.vendor_sp.count({
        where: {
          vendor_id: vendorId,
          deleted_at: null,
        },
      });

      const result = {
        has_active_sp: false,
        has_ever_sp: spHistoryCount > 0,
        sp_level: null,
        sp_status: 'NORMAL',
        vendor_status: 'AKTIF',
        message: 'Vendor tidak memiliki Surat Peringatan yang aktif.',
      };
      this.setCachedSpStatus(vendorId, result);
      return result;
    }

    const spStatusText = this.getSpStatusText(activeSP.sp_level);
    const vendorStatus = activeSP.sp_level === SpLevel.SP3 ? 'NONAKTIF' : 'AKTIF';

    const result = {
      has_active_sp: true,
      has_ever_sp: true,
      sp_id: activeSP.id,
      sp_level: activeSP.sp_level,
      sp_status: spStatusText,
      vendor_status: vendorStatus,
      total_point: activeSP.total_point,
      start_date: activeSP.start_date,
      end_date: activeSP.end_date,
      allocation_reduction: activeSP.allocation_reduction,
      vendor: activeSP.vendor,
      message: `Vendor memiliki ${spStatusText} dengan total ${activeSP.total_point} poin penalti.`,
    };
    
    this.setCachedSpStatus(vendorId, result);
    return result;
  }

  // ================================
  // EXTEND SP DURATION
  // ================================

  async extendSpDuration(id: number, newEndDate: Date, userId?: number) {
    try {
      const sp = await this.dbService.vendor_sp.findFirst({
        where: { id, deleted_at: null },
      });

      if (!sp) {
        throw new NotFoundException(`Surat Peringatan dengan ID ${id} tidak ditemukan.`);
      }

      if (sp.status !== 1) {
        throw new BadRequestException('Hanya SP yang masih aktif yang bisa diperpanjang.');
      }

      return await this.dbService.vendor_sp.update({
        where: { id },
        data: {
          end_date: newEndDate,
          status: 3, // EXTENDED
          updated_by: userId,
          updated_at: new Date(),
        },
      });
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // COMPLETE SP
  // ================================

  async completeSp(id: number, userId?: number) {
    try {
      const sp = await this.dbService.vendor_sp.findFirst({
        where: { id, deleted_at: null },
      });

      if (!sp) {
        throw new NotFoundException(`Surat Peringatan dengan ID ${id} tidak ditemukan.`);
      }

      if (sp.status !== 1 && sp.status !== 3) {
        throw new BadRequestException('SP ini sudah tidak aktif.');
      }

      const updated = await this.dbService.vendor_sp.update({
        where: { id },
        data: {
          status: 2, // SELESAI
          end_date: new Date(),
          updated_by: userId,
          updated_at: new Date(),
        },
      });

      // If vendor is inactive due to SP3, keep them inactive
      // They need to go through reactivation process

      return updated;
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // REACTIVATION (SP3 only)
  // ================================

  async reactivateVendor(dto: ReactivateVendorDto, userId: number) {
    try {
      if (!userId) {
        throw new BadRequestException('User approver tidak ditemukan.');
      }

      return await this.dbService.$transaction(async (tx) => {
        const vendor = await tx.vendor.findFirst({
          where: { id: dto.vendor_id, deleted_at: null },
        });

        if (!vendor) {
          throw new NotFoundException(`Vendor dengan ID ${dto.vendor_id} tidak ditemukan.`);
        }

        // Check if vendor is inactive
        if (vendor.is_active) {
          throw new BadRequestException('Vendor sudah aktif. Reaktivasi hanya untuk vendor nonaktif.');
        }

        // Create reactivation log
        const reactivationLog = await tx.vendor_reactivation_log.create({
          data: {
            vendor_id: dto.vendor_id,
            previous_sp_id: dto.previous_sp_id,
            reason: dto.reason,
            approved_by: userId,
            status: 2, // APPROVED
          },
        });

        // Reactivate vendor
        await tx.vendor.update({
          where: { id: dto.vendor_id },
          data: { is_active: true },
        });

        return {
          reactivation_log: reactivationLog,
          vendor: await tx.vendor.findFirst({
            where: { id: dto.vendor_id },
            select: { id: true, company_name: true, pic_name: true, is_active: true },
          }),
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async getReactivationLogs(vendorId?: number) {
    try {
      const where = vendorId ? { vendor_id: vendorId } : {};

      return await this.dbService.vendor_reactivation_log.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: {
          vendor: {
            select: { id: true, company_name: true, pic_name: true },
          },
        },
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * [POIN 5] Get reactivation logs dengan filter + pagination.
   * Filter: search (vendor company_name/PIC), status, date_from/date_to
   * (reactivation request created_at). Pagination max 100 per request.
   */
  async findReactivationLogs(query: QueryReactivationLogDto) {
    const page = query.page ?? 1;
    const take = query.take ?? 10;
    const skip = (page - 1) * take;

    const where: any = {};

    if (query.status != null) {
      where.status = query.status;
    }

    if (query.date_from || query.date_to) {
      where.created_at = {};
      if (query.date_from) {
        where.created_at.gte = new Date(query.date_from);
      }
      if (query.date_to) {
        // Akhir hari untuk date_to biar inklusif
        where.created_at.lte = new Date(`${query.date_to}T23:59:59.999Z`);
      }
    }

    if (query.search && query.search.trim()) {
      // Search across vendor company_name ATAU pic_name (case-insensitive)
      where.vendor = {
        OR: [
          { company_name: { contains: query.search.trim() } },
          { pic_name: { contains: query.search.trim() } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.dbService.vendor_reactivation_log.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          vendor: {
            select: {
              id: true,
              company_name: true,
              pic_name: true,
              email_address: true,
              is_active: true,
            },
          },
        },
      }),
      this.dbService.vendor_reactivation_log.count({ where }),
    ]);

    return { data, meta: { total, page, take, skip } };
  }

  // ================================
  // GET ALL VENDORS WITH SP STATUS (for allocation)
  // ================================

  async getVendorsWithSpStatus(vendorIds?: number[]) {
    try {
      const now = new Date();

      const vendors = await this.dbService.vendor.findMany({
        where: {
          deleted_at: null,
          ...(vendorIds ? { id: { in: vendorIds } } : {}),
        },
        select: {
          id: true,
          company_name: true,
          pic_name: true,
          is_active: true,
        },
      });

      // Get active SP for each vendor
      const vendorIdsList = vendors.map((v) => v.id);
      const activeSPs = await this.dbService.vendor_sp.findMany({
        where: {
          vendor_id: { in: vendorIdsList },
          status: { in: [1, 3] }, // AKTIF or EXTENDED
          end_date: { gte: now },
        },
        orderBy: { sp_level: 'desc' },
      });

      const spMap = new Map(activeSPs.map((sp) => [sp.vendor_id, sp]));

      return vendors.map((vendor) => {
        const activeSP = spMap.get(vendor.id);
        return {
          ...vendor,
          has_active_sp: !!activeSP,
          sp_level: activeSP?.sp_level ?? null,
          sp_status: activeSP ? this.getSpStatusText(activeSP.sp_level) : null,
          total_point: activeSP?.total_point ?? null,
          allocation_reduction: activeSP?.allocation_reduction ?? null,
          can_receive_order: !activeSP || activeSP.sp_level < 3,
        };
      });
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // HELPER METHODS
  // ================================

  private getSpStatusText(level: number): string {
    const statusMap: Record<number, string> = {
      1: 'SP1',
      2: 'SP2',
      3: 'SP3',
    };
    return statusMap[level] || 'UNKNOWN';
  }

  // ================================
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
    await this.pdfService.pipeAndSave(doc, filePath);

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
    await this.pdfService.pipeAndSave(doc, filePath);

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
}
