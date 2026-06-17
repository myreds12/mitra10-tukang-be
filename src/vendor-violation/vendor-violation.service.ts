/* eslint-disable prettier/prettier */
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorViolationTypeDto, UpdateVendorViolationTypeDto } from './dto/create-violation-type.dto';
import { CreateViolationLogDto, QueryViolationLogDto } from './dto/create-violation-log.dto';
import { Prisma } from '@prisma/client';
import { SPAllocationReduction } from '../common/enum/violation-type.enum';

@Injectable()
export class VendorViolationService {
  constructor(private readonly dbService: PrismaService) {}

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
      const violationLog = await this.dbService.vendor_violation_log.create({
        data: {
          vendor_id: dto.vendor_id,
          violation_type_id: dto.violation_type_id,
          order_id: dto.order_id,
          quarter,
          year,
          description: dto.description,
          evidence_path: dto.evidence_path,
          created_by: userId,
        },
        include: {
          vendor: { select: { id: true, company_name: true, pic_name: true } },
          violation_type: true,
        },
      });

      // Check and update vendor SP status based on new point total
      await this.checkAndUpdateVendorSP(dto.vendor_id);

      return violationLog;
    } catch (error) {
      throw error;
    }
  }

  async findAllViolationLogs(query: QueryViolationLogDto) {
    try {
      const { page = 1, take = 10, vendor_id, quarter, year, category, date_from, date_to } = query;
      const skip = page * take - take;

      const where: Prisma.vendor_violation_logWhereInput = {
        deleted_at: null,
        ...(vendor_id ? { vendor_id } : {}),
        ...(quarter ? { quarter } : {}),
        ...(year ? { year } : {}),
        ...(category
          ? { violation_type: { category } }
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
  async checkAndUpdateVendorSP(vendorId: number) {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const year = now.getFullYear();

    const pointsInfo = await this.getVendorQuarterPoints(vendorId, quarter, year);

    // If SP level is reached and no active SP of that level
    if (pointsInfo.sp_level && !pointsInfo.active_sp) {
      await this.issueSP(vendorId, pointsInfo.sp_level, pointsInfo.total_points, quarter, year);
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

  // Issue SP to vendor
  private async issueSP(
    vendorId: number,
    spLevel: number,
    totalPoints: number,
    quarter: number,
    year: number,
  ) {
    const now = new Date();
    const startDate = now;
    const endDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

    // Calculate allocation reduction based on SP level
    const allocationReduction = this.getAllocationReduction(spLevel);

    // FIX: Check if SP with this level already exists (prevent duplicate)
    const existingSP = await this.dbService.vendor_sp.findFirst({
      where: {
        vendor_id: vendorId,
        sp_level: spLevel,
        status: 1, // AKTIF
        deleted_at: null,
      },
    });

    if (existingSP) {
      // Update existing SP points instead of creating duplicate
      await this.dbService.vendor_sp.update({
        where: { id: existingSP.id },
        data: {
          total_point: totalPoints,
          updated_at: now,
        },
      });
      return;
    }

    // If SP3, deactivate vendor
    if (spLevel === 3) {
      await this.dbService.vendor.update({
        where: { id: vendorId },
        data: { is_active: false },
      });
    }

    await this.dbService.vendor_sp.create({
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
      },
    });
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
