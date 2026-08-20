/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorViolationTypeDto, UpdateVendorViolationTypeDto } from './dto/create-violation-type.dto';
import {
  CreateViolationLogDto,
  ExportViolationLogDto,
  QueryViolationLogDto,
} from './dto/create-violation-log.dto';
import { Prisma } from '@prisma/client';
import { SPAllocationReduction } from '../common/enum/violation-type.enum';
import { syncVendorSpDetails } from '../common/utils/vendor-sp-detail-sync.util';
import * as exceljs from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

const VIOLATION_LOG_EXPORT_MAX_ROWS = 50000;
const VIOLATION_LOG_EXPORT_FOLDER = './storage/excel/vendor-violation';

@Injectable()
export class VendorViolationService {
  private readonly logger = new Logger(VendorViolationService.name);

  constructor(private readonly dbService: PrismaService) {}

  async getRoleName(userId?: number): Promise<string | null> {
    if (!userId) return null;
    const user = await this.dbService.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: { roles: { select: { name: true } } },
    });
    return user?.roles?.name ?? null;
  }

  private getSPLevel(totalPoints: number): number | null {
    if (totalPoints > 50) return 3;
    if (totalPoints >= 26) return 2;
    if (totalPoints >= 1) return 1;
    return null;
  }

  private getSPStatus(totalPoints: number): string {
    if (totalPoints > 50) return 'SP3';
    if (totalPoints >= 26) return 'SP2';
    if (totalPoints >= 1) return 'SP1';
    return 'active';
  }

  private getAllocationReduction(spLevel: number): number {
    if (spLevel === 1) return SPAllocationReduction.SP1_MAX;
    if (spLevel === 2) return SPAllocationReduction.SP2_MAX;
    if (spLevel === 3) return SPAllocationReduction.SP3;
    return 0;
  }

  // ================================
  // VENDOR VIOLATION TYPE
  // ================================

  async createViolationType(
    dto: CreateVendorViolationTypeDto,
    userId?: number,
  ) {
    try {
      const existingType = await this.dbService.vendor_violation_type.findFirst({
        where: {
          code: dto.code,
          deleted_at: null,
        },
      });

      if (existingType) {
        throw new BadRequestException(
          `Jenis pelanggaran dengan kode "${dto.code}" sudah ada.`,
        );
      }

      const violationType = await this.dbService.vendor_violation_type.create({
        data: {
          code: dto.code,
          category: dto.category,
          name: dto.name,
          description: dto.description,
          point: dto.point,
          is_active: dto.is_active ?? true,
          created_by: userId,
        },
      });

      return violationType;
    } catch (error) {
      throw error;
    }
  }

  async findAllViolationTypes(query: {
    page?: number;
    take?: number;
    search?: string;
    category?: string;
    is_active?: boolean;
  }) {
    try {
      const { page = 1, take = 10, search, category, is_active } = query;
      const skip = page * take - take;

      const where: Prisma.vendor_violation_typeWhereInput = {
        deleted_at: null,
        ...(is_active !== undefined ? { is_active } : {}),
        ...(category ? { category } : {}),
        ...(search
          ? {
              OR: [
                { code: { contains: search } },
                { name: { contains: search } },
                { category: { contains: search } },
              ],
            }
          : {}),
      };

      const [violationTypes, total] = await Promise.all([
        this.dbService.vendor_violation_type.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: 'desc' },
        }),
        this.dbService.vendor_violation_type.count({ where }),
      ]);

      return {
        data: violationTypes,
        meta: { total, page, take, skip },
      };
    } catch (error) {
      throw error;
    }
  }

  async findOneViolationType(id: number) {
    try {
      const violationType = await this.dbService.vendor_violation_type.findFirst({
        where: { id, deleted_at: null },
      });

      if (!violationType) {
        throw new NotFoundException(`Jenis pelanggaran dengan ID ${id} tidak ditemukan.`);
      }

      return violationType;
    } catch (error) {
      throw error;
    }
  }

  async updateViolationType(
    id: number,
    dto: UpdateVendorViolationTypeDto,
    userId?: number,
  ) {
    try {
      const existing = await this.dbService.vendor_violation_type.findFirst({
        where: { id, deleted_at: null },
      });

      if (!existing) {
        throw new NotFoundException(`Jenis pelanggaran dengan ID ${id} tidak ditemukan.`);
      }

      if (dto.code && dto.code !== existing.code) {
        const duplicate = await this.dbService.vendor_violation_type.findFirst({
          where: { code: dto.code, deleted_at: null, id: { not: id } },
        });
        if (duplicate) {
          throw new BadRequestException(
            `Jenis pelanggaran dengan kode "${dto.code}" sudah ada.`,
          );
        }
      }

      const updated = await this.dbService.vendor_violation_type.update({
        where: { id },
        data: {
          code: dto.code,
          category: dto.category,
          name: dto.name,
          description: dto.description,
          point: dto.point,
          is_active: dto.is_active,
          updated_by: userId,
          updated_at: new Date(),
        },
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  async deleteViolationType(id: number, userId?: number) {
    try {
      const existing = await this.dbService.vendor_violation_type.findFirst({
        where: { id, deleted_at: null },
      });

      if (!existing) {
        throw new NotFoundException(`Jenis pelanggaran dengan ID ${id} tidak ditemukan.`);
      }

      return await this.dbService.vendor_violation_type.update({
        where: { id },
        data: {
          deleted_at: new Date(),
          deleted_by: userId,
          is_active: false,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  // ================================
  // VENDOR VIOLATION LOG
  // ================================

  async createViolationLog(dto: CreateViolationLogDto, userId?: number) {
    try {
      // Get current quarter and year
      const now = new Date();
      const quarter = Math.ceil((now.getMonth() + 1) / 3);
      const year = now.getFullYear();

      // Verify vendor exists
      const vendor = await this.dbService.vendor.findFirst({
        where: { id: dto.vendor_id, deleted_at: null },
      });

      if (!vendor) {
        throw new NotFoundException(`Vendor dengan ID ${dto.vendor_id} tidak ditemukan.`);
      }

      // Verify violation type exists
      const violationType = await this.dbService.vendor_violation_type.findFirst({
        where: { id: dto.violation_type_id, deleted_at: null, is_active: true },
      });

      if (!violationType) {
        throw new NotFoundException(
          `Jenis pelanggaran dengan ID ${dto.violation_type_id} tidak ditemukan atau tidak aktif.`,
        );
      }

      // Create violation log
      // [POIN 6] Manual entry via UI → provenance MANUAL_UPLOAD otomatis.
      // evidence_path wajib ada (DTO @IsNotEmpty sudah enforce di Lapis 3 UI guard).
      const violationLog = await this.dbService.vendor_violation_log.create({
        data: {
          vendor_id: dto.vendor_id,
          violation_type_id: dto.violation_type_id,
          order_id: dto.order_id,
          quarter,
          year,
          description: dto.description,
          evidence_path: dto.evidence_path,
          evidence_provenance: 'MANUAL_UPLOAD',
          created_by: userId,
        },
        include: {
          vendor: { select: { id: true, company_name: true, pic_name: true } },
          violation_type: true,
        },
      });

      // Check and update vendor SP status based on new point total
      await this.checkAndUpdateVendorSP(dto.vendor_id, userId ?? null);

      return violationLog;
    } catch (error) {
      throw error;
    }
  }

  async findAllViolationLogs(query: QueryViolationLogDto) {
    try {
      const { page = 1, take = 10, vendor_id, quarter, year, category, date_from, date_to, search } = query;
      const skip = page * take - take;

      const where: Prisma.vendor_violation_logWhereInput = {
        deleted_at: null,
        ...(vendor_id ? { vendor_id } : {}),
        ...(quarter ? { quarter } : {}),
        ...(year ? { year } : {}),
        ...(category
          ? { violation_type: { category } }
          : {}),
        ...(search
          ? {
              OR: [
                { vendor: { company_name: { contains: search } } },
                { vendor: { pic_name: { contains: search } } },
                { violation_type: { code: { contains: search } } },
                { violation_type: { name: { contains: search } } },
                { orders: { project_number: { contains: search } } },
              ],
            }
          : {}),
        ...(date_from && date_to
          ? {
              created_at: {
                gte: new Date(date_from),
                lte: new Date(`${date_to}T23:59:59.000Z`),
              },
            }
          : {}),
      };

      const [logs, total] = await Promise.all([
        this.dbService.vendor_violation_log.findMany({
          where,
          skip,
          take,
          orderBy: { created_at: 'desc' },
          include: {
            vendor: { select: { id: true, company_name: true, pic_name: true } },
            violation_type: true,
            orders: { select: { id: true, project_number: true, status: true } },
          },
        }),
        this.dbService.vendor_violation_log.count({ where }),
      ]);

      return {
        data: logs,
        meta: { total, page, take, skip },
      };
    } catch (error) {
      throw error;
    }
  }

  async exportViolationLogExcel(
    query: ExportViolationLogDto,
    userId: number | null,
  ): Promise<{ filePath: string; fileName: string; rowCount: number }> {
    const { vendor_id, quarter, year, category, search, date_from, date_to } = query;

    if (date_from && date_to && new Date(date_from) > new Date(date_to)) {
      throw new BadRequestException(
        'date_from tidak boleh lebih besar dari date_to.',
      );
    }

    const where: Prisma.vendor_violation_logWhereInput = {
      deleted_at: null,
      ...(vendor_id ? { vendor_id } : {}),
      ...(quarter ? { quarter } : {}),
      ...(year ? { year } : {}),
      ...(category ? { violation_type: { category } } : {}),
      ...(search
        ? {
            OR: [
              { vendor: { company_name: { contains: search } } },
              { vendor: { pic_name: { contains: search } } },
              { violation_type: { code: { contains: search } } },
              { violation_type: { name: { contains: search } } },
              { orders: { project_number: { contains: search } } },
            ],
          }
        : {}),
      ...(date_from && date_to
        ? {
            created_at: {
              gte: new Date(date_from),
              lte: new Date(`${date_to}T23:59:59.000Z`),
            },
          }
        : {}),
    };

    const totalCount = await this.dbService.vendor_violation_log.count({ where });
    if (totalCount > VIOLATION_LOG_EXPORT_MAX_ROWS) {
      throw new BadRequestException(
        `Hasil export ${totalCount} baris melebihi batas ${VIOLATION_LOG_EXPORT_MAX_ROWS}. Persempit filter (misalnya tambahkan quarter/year atau vendor_id) lalu coba lagi.`,
      );
    }

    const rows = await this.dbService.vendor_violation_log.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        vendor: { select: { id: true, company_name: true, pic_name: true } },
        violation_type: true,
        orders: { select: { id: true, project_number: true } },
      },
    });

    const workbook = new exceljs.Workbook();
    workbook.creator = 'Mitra10 Tukang';
    workbook.created = new Date();

    const logSheet = workbook.addWorksheet('Log Pelanggaran');
    logSheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Tanggal', key: 'created_at', width: 20 },
      { header: 'Nama Vendor', key: 'vendor_name', width: 30 },
      { header: 'PIC', key: 'pic_name', width: 24 },
      { header: 'Kategori', key: 'category', width: 18 },
      { header: 'Kode Pelanggaran', key: 'code', width: 28 },
      { header: 'Nama Pelanggaran', key: 'vt_name', width: 32 },
      { header: 'Order ID', key: 'order_id', width: 10 },
      { header: 'Project Number', key: 'project_number', width: 20 },
      { header: 'Poin', key: 'point', width: 8 },
      { header: 'Quarter', key: 'quarter', width: 10 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Status Aktif', key: 'is_active', width: 12 },
      { header: 'Evidence Path', key: 'evidence_path', width: 36 },
      { header: 'Ada Evidence', key: 'has_evidence', width: 14 },
      { header: 'Deskripsi', key: 'description', width: 40 },
    ];

    logSheet.addRows(
      rows.map((r) => ({
        id: r.id,
        created_at: new Date(r.created_at).toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta',
        }),
        vendor_name: r.vendor?.company_name ?? '',
        pic_name: r.vendor?.pic_name ?? '',
        category: r.violation_type?.category ?? '',
        code: r.violation_type?.code ?? '',
        vt_name: r.violation_type?.name ?? '',
        order_id: r.order_id ?? '',
        project_number: r.orders?.project_number ?? '',
        point: r.adjusted_point ?? r.violation_type?.point ?? 0,
        quarter: `Q${r.quarter}`,
        year: r.year,
        is_active: r.is_active ? 'Aktif' : 'Nonaktif',
        evidence_path: r.evidence_path ?? '',
        has_evidence: r.evidence_path ? 'Ya' : 'Tidak',
        description: r.description ?? '',
      })),
    );

    const summaryMap = new Map<
      number,
      { vendorName: string; total: number; totalPoint: number; noEvidence: number }
    >();
    for (const r of rows) {
      const key = r.vendor_id;
      const entry = summaryMap.get(key) ?? {
        vendorName: r.vendor?.company_name ?? `Vendor ${key}`,
        total: 0,
        totalPoint: 0,
        noEvidence: 0,
      };
      entry.total += 1;
      entry.totalPoint += r.adjusted_point ?? r.violation_type?.point ?? 0;
      if (!r.evidence_path) entry.noEvidence += 1;
      summaryMap.set(key, entry);
    }

    const vendorSpLevels = await this.dbService.vendor_sp.findMany({
      where: {
        vendor_id: { in: [...summaryMap.keys()] },
        status: 1,
        deleted_at: null,
        end_date: { gte: new Date() },
      },
      orderBy: { sp_level: 'desc' },
      distinct: ['vendor_id'],
      select: { vendor_id: true, sp_level: true },
    });
    const spLevelByVendor = new Map(vendorSpLevels.map((s) => [s.vendor_id, s.sp_level]));

    const summarySheet = workbook.addWorksheet('Summary per Vendor');
    summarySheet.columns = [
      { header: 'Nama Vendor', key: 'vendor_name', width: 32 },
      { header: 'Total Pelanggaran', key: 'total', width: 18 },
      { header: 'Total Poin', key: 'total_point', width: 14 },
      { header: 'SP Level Saat Ini', key: 'sp_level', width: 18 },
      { header: 'Pelanggaran Tanpa Evidence', key: 'no_evidence', width: 24 },
    ];

    summarySheet.addRows(
      [...summaryMap.entries()].map(([vendorId, entry]) => ({
        vendor_name: entry.vendorName,
        total: entry.total,
        total_point: entry.totalPoint,
        sp_level: spLevelByVendor.has(vendorId)
          ? `SP${spLevelByVendor.get(vendorId)}`
          : 'Tidak Ada',
        no_evidence: entry.noEvidence,
      })),
    );

    for (const sheet of [logSheet, summarySheet]) {
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, size: 11 };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE9EEF7' },
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    fs.mkdirSync(path.resolve(VIOLATION_LOG_EXPORT_FOLDER), { recursive: true });
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace(/Z$/, '');
    const random = Math.random().toString(36).slice(2, 6);
    const fileName = `log-pelanggaran-${stamp}-${random}.xlsx`;
    const filePath = path.resolve(VIOLATION_LOG_EXPORT_FOLDER, fileName);
    await workbook.xlsx.writeFile(filePath);

    try {
      await this.dbService.logs.create({
        data: {
          module_type: 'EXPORT',
          module_id: null,
          issuer_type: 'USER',
          issuer_id: userId ?? null,
          properties: JSON.stringify({
            endpoint: 'GET /vendor-violation/log/export',
            filters: { vendor_id, quarter, year, category, search, date_from, date_to },
            row_count: rows.length,
            file_path: filePath,
            file_name: fileName,
          }),
        },
      });
    } catch (auditError) {
      this.logger.warn(
        `exportViolationLogExcel audit log failed vendor=${vendor_id ?? 'all'} reason=${(auditError as Error)?.message ?? auditError}`,
      );
    }

    this.logger.log(
      `exportViolationLogExcel user=${userId ?? 'anonymous'} rows=${rows.length} file=${filePath}`,
    );

    return { filePath, fileName, rowCount: rows.length };
  }

  async getVendorQuarterPoints(vendorId: number, quarter?: number, year?: number) {
    try {
      const now = new Date();
      const currentQuarter = quarter || Math.ceil((now.getMonth() + 1) / 3);
      const currentYear = year || now.getFullYear();

      // Get all active violations for this vendor in this quarter
      const violations = await this.dbService.vendor_violation_log.findMany({
        where: {
          vendor_id: vendorId,
          quarter: currentQuarter,
          year: currentYear,
          deleted_at: null,
        },
        include: {
          violation_type: true,
        },
      });

      // Calculate total points
      const totalPoints = violations.reduce(
        (sum, v) => sum + (v.adjusted_point ?? v.violation_type.point),
        0,
      );

      // Determine SP level
      const spLevel = this.getSPLevel(totalPoints);
      const spStatus = this.getSPStatus(totalPoints);

      // Get active SP if any
      const activeSP = await this.dbService.vendor_sp.findFirst({
        where: {
          vendor_id: vendorId,
          status: 1, // AKTIF
          end_date: { gte: now },
        },
        orderBy: { sp_level: 'desc' },
      });

      const spHistoryCount = await this.dbService.vendor_sp.count({
        where: {
          vendor_id: vendorId,
          deleted_at: null,
        },
      });

      // Check for penalty period (if points were received less than 12 weeks before next quarter)
      const nextQuarterStart = this.getNextQuarterStart(currentQuarter, currentYear);
      const weeksUntilNextQuarter = Math.floor(
        (nextQuarterStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 7),
      );

      let penaltyExtendedUntil: Date | null = null;
      if (weeksUntilNextQuarter < 12 && totalPoints > 0) {
        // Penalty extends to end of next quarter
        penaltyExtendedUntil = this.getQuarterEnd(
          currentQuarter === 4 ? 1 : currentQuarter + 1,
          currentQuarter === 4 ? currentYear + 1 : currentYear,
        );
      }

      return {
        vendor_id: vendorId,
        quarter: currentQuarter,
        year: currentYear,
        total_points: totalPoints,
        total_points_this_quarter: totalPoints,
        violation_count: violations.length,
        sp_level: spLevel,
        current_sp_level: spLevel ? `SP ${spLevel}` : null,
        sp_status: spStatus,
        status_sp: spStatus,
        current_quarter: `Q${currentQuarter}`,
        quarter_start: this.getQuarterStart(currentQuarter, currentYear),
        quarter_end: this.getQuarterEnd(currentQuarter, currentYear),
        active_sp: activeSP,
        has_ever_sp: spHistoryCount > 0,
        penalty_extended_until: penaltyExtendedUntil,
        weeks_until_next_quarter: weeksUntilNextQuarter,
        violations: violations.map((violation) => ({
          ...violation,
          effective_point: violation.adjusted_point ?? violation.violation_type.point,
        })),
      };
    } catch (error) {
      throw error;
    }
  }

  // Helper: Check and update vendor SP based on current points
  async checkAndUpdateVendorSP(vendorId: number, userId: number | null = null) {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const year = now.getFullYear();

    const pointsInfo = await this.getVendorQuarterPoints(vendorId, quarter, year);

    // If SP level is reached and no active SP of that level
    if (pointsInfo.sp_level && !pointsInfo.active_sp) {
      await this.issueSP(vendorId, pointsInfo.sp_level, pointsInfo.total_points, quarter, year, userId);
      return;
    }

    if (pointsInfo.active_sp) {
      if (!pointsInfo.sp_level) {
        await this.dbService.vendor_sp.update({
          where: { id: pointsInfo.active_sp.id },
          data: {
            status: 2,
            total_point: pointsInfo.total_points,
            updated_at: now,
          },
        });

        if (pointsInfo.active_sp.sp_level === 3) {
          await this.dbService.vendor.update({
            where: { id: vendorId },
            data: { is_active: true },
          });
        }
        return;
      }

      await this.dbService.vendor_sp.update({
        where: { id: pointsInfo.active_sp.id },
        data: {
          sp_level: pointsInfo.sp_level,
          total_point: pointsInfo.total_points,
          allocation_reduction: this.getAllocationReduction(pointsInfo.sp_level),
          updated_at: now,
        },
      });

      if (pointsInfo.sp_level === 3) {
        await this.dbService.vendor.update({
          where: { id: vendorId },
          data: { is_active: false },
        });
      }
    }
  }

  // Issue SP to vendor (atomic: vendor_sp + vendor_sp_detail sync in one transaction)
  private async issueSP(
    vendorId: number,
    spLevel: number,
    totalPoints: number,
    quarter: number,
    year: number,
    userId: number | null = null,
  ) {
    const now = new Date();
    const startDate = now;
    const endDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

    const allocationReduction = this.getAllocationReduction(spLevel);

    try {
      return await this.dbService.$transaction(async (tx) => {
        // Check if SP with this level already exists (prevent duplicate)
        const existingSP = await tx.vendor_sp.findFirst({
          where: {
            vendor_id: vendorId,
            sp_level: spLevel,
            status: 1, // AKTIF
            deleted_at: null,
          },
        });

        if (existingSP) {
          const updated = await tx.vendor_sp.update({
            where: { id: existingSP.id },
            data: {
              total_point: totalPoints,
              updated_at: now,
            },
          });
          // Sync detail rows so new violations added since the SP was first
          // issued get linked too — same helper, idempotent.
          const detail = await syncVendorSpDetails(tx, {
            vendorSpId: existingSP.id,
            vendorId,
            quarter,
            year,
            createdBy: userId,
          });
          this.logger.log(
            `[SP update] vendor=${vendorId} level=SP${spLevel} spId=${existingSP.id} Q${quarter}/${year} linked=${detail.totalLinked} newLinked=${detail.inserted}`,
          );
          return updated;
        }

        // If SP3, deactivate vendor inside the same transaction
        if (spLevel === 3) {
          await tx.vendor.update({
            where: { id: vendorId },
            data: { is_active: false },
          });
        }

        const createdSP = await tx.vendor_sp.create({
          data: {
            vendor_id: vendorId,
            sp_level: spLevel,
            total_point: totalPoints,
            quarter,
            year,
            start_date: startDate,
            end_date: endDate,
            status: 1, // AKTIF
            allocation_reduction: allocationReduction,
            created_by: userId,
          },
        });

        const detail = await syncVendorSpDetails(tx, {
          vendorSpId: createdSP.id,
          vendorId,
          quarter,
          year,
          createdBy: userId,
        });

        this.logger.log(
          `[SP issued] vendor=${vendorId} level=SP${spLevel} spId=${createdSP.id} Q${quarter}/${year} linked=${detail.totalLinked} newLinked=${detail.inserted}`,
        );

        return createdSP;
      });
    } catch (error) {
      this.logger.error(
        `issueSP failed: vendor=${vendorId} spLevel=SP${spLevel} Q${quarter}/${year} reason=${(error as Error)?.message ?? String(error)}`,
        (error as Error)?.stack,
      );
      // Re-throw so the global exception filter returns a clean 5xx without
      // leaking internals to the client.
      throw error;
    }
  }

  private getNextQuarterStart(quarter: number, year: number): Date {
    const quarterStartMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
    const nextQuarter = quarter === 4 ? 1 : quarter + 1;
    const nextYear = quarter === 4 ? year + 1 : year;
    return new Date(nextYear, quarterStartMonths[nextQuarter - 1], 1);
  }

  private getQuarterStart(quarter: number, year: number): Date {
    const quarterStartMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
    return new Date(year, quarterStartMonths[quarter - 1], 1);
  }

  private getQuarterEnd(quarter: number, year: number): Date {
    return new Date(year, quarter * 3, 0, 23, 59, 59);
  }
}
