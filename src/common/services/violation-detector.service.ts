/* eslint-disable prettier/prettier */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ViolationTypeCode,
  ViolationCategory,
  SPThreshold,
  SPAllocationReduction,
  SP_DURATION_DAYS,
  ViolationContext,
  ViolationResult,
} from '../../common/enum/violation-type.enum';
import { NotificationsService } from '../../notifications/notifications.service';
import { moduleTypeNotification } from '../../notifications/dto/notification-module-type.enum';

@Injectable()
export class ViolationDetectorService {
  private readonly logger = new Logger(ViolationDetectorService.name);

  constructor(
    private readonly dbService: PrismaService,
    private readonly notifService: NotificationsService,
  ) {}

  /**
   * Method utama untuk mencatat pelanggaran
   * @param violationCode Kode pelanggaran dari ViolationTypeCode enum
   * @param context Context pelanggaran (vendorId, orderId, dll)
   * @param userId User yang mencatat (opsional)
   */
  async recordViolation(
    violationCode: string,
    context: ViolationContext,
    userId?: number,
  ): Promise<ViolationResult> {
    try {
      // 1. Get violation type dari database
      const violationType = await this.getViolationType(violationCode);
      if (!violationType) {
        this.logger.warn(`Violation type not found: ${violationCode}`);
        return {
          success: false,
          pointAdded: 0,
          newTotalPoints: 0,
          message: `Jenis pelanggaran ${violationCode} tidak ditemukan di database`,
        };
      }

      // 2. Get current quarter dan year
      const { quarter, year } = this.getCurrentQuarterYear();

      // 3. Check jika pelanggaran sudah pernah dicatat untuk order ini (prevent duplicate)
      const isDuplicate = await this.checkDuplicateViolation(
        context.vendorId,
        violationType.id,
        context.orderId,
        quarter,
        year,
      );

      if (isDuplicate) {
        this.logger.debug(`Duplicate violation skipped: ${violationCode} for vendor ${context.vendorId}`);
        return {
          success: false,
          pointAdded: 0,
          newTotalPoints: 0,
          message: 'Pelanggaran sudah pernah dicatat untuk order ini',
        };
      }

      // 4. Simpan ke vendor_violation_log
      const violationLog = await this.dbService.vendor_violation_log.create({
        data: {
          vendor_id: context.vendorId,
          violation_type_id: violationType.id,
          order_id: context.orderId,
          quarter,
          year,
          description: context.description || violationType.description,
          evidence_path: context.evidencePath,
          is_active: true,
          created_by: userId,
        },
      });

      this.logger.log(
        `Violation recorded: ${violationCode} | Vendor: ${context.vendorId} | Points: ${violationType.point} | Q${quarter}/${year}`,
      );

      // 5. Hitung total poin vendor di quartal ini
      const totalPoints = await this.calculateTotalPoints(context.vendorId, quarter, year);

      // 6. Check apakah perlu buat/update SP
      const spResult = await this.checkAndIssueSP(
        context.vendorId,
        totalPoints,
        quarter,
        year,
        userId,
      );

      // 7. Kirim notifikasi ke vendor
      await this.sendViolationNotification(
        context.vendorId,
        violationType.name,
        violationType.point,
        totalPoints,
      );

      return {
        success: true,
        violationLogId: violationLog.id,
        pointAdded: violationType.point,
        newTotalPoints: totalPoints,
        spIssued: spResult,
        message: `Pelanggaran "${violationType.name}" berhasil dicatat. Total poin: ${totalPoints}`,
      };
    } catch (error) {
      this.logger.error(`Error recording violation: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get violation type dari database berdasarkan kode
   */
  private async getViolationType(code: string) {
    return await this.dbService.vendor_violation_type.findFirst({
      where: {
        code,
        is_active: true,
        deleted_at: null,
      },
    });
  }

  /**
   * Get current quarter dan year
   */
  private getCurrentQuarterYear(): { quarter: number; year: number } {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const quarter = Math.ceil((month + 1) / 3);
    return { quarter, year };
  }

  /**
   * Check jika pelanggaran sudah pernah dicatat
   */
  private async checkDuplicateViolation(
    vendorId: number,
    violationTypeId: number,
    orderId: number | undefined,
    quarter: number,
    year: number,
  ): Promise<boolean> {
    const existing = await this.dbService.vendor_violation_log.findFirst({
      where: {
        vendor_id: vendorId,
        violation_type_id: violationTypeId,
        order_id: orderId,
        quarter,
        year,
        deleted_at: null,
      },
    });
    return !!existing;
  }

  /**
   * Hitung total poin vendor di quartal tertentu
   */
  async calculateTotalPoints(
    vendorId: number,
    quarter: number,
    year: number,
  ): Promise<number> {
    const violations = await this.dbService.vendor_violation_log.findMany({
      where: {
        vendor_id: vendorId,
        quarter,
        year,
        deleted_at: null,
      },
      include: {
        violation_type: {
          select: { point: true },
        },
      },
    });

    return violations.reduce(
      (sum, v) => sum + (v.adjusted_point ?? v.violation_type.point),
      0,
    );
  }

  /**
   * Check dan issue SP jika threshold tercapai
   * Mengikuti rule: jika poin < 12 minggu sebelum quartal berikutnya,
   * penalti tetap berlaku 90 hari meski quartal berganti
   */
  private async checkAndIssueSP(
    vendorId: number,
    totalPoints: number,
    quarter: number,
    year: number,
    userId?: number,
  ): Promise<{ spId: number; spLevel: number } | undefined> {
    // Tentukan level SP berdasarkan threshold
    let spLevel: number | null = null;

    if (totalPoints >= SPThreshold.SP3) {
      spLevel = 3;
    } else if (totalPoints >= SPThreshold.SP2) {
      spLevel = 2;
    } else if (totalPoints >= SPThreshold.SP1) {
      spLevel = 1;
    }

    if (!spLevel) {
      return undefined;
    }

    // Cek apakah vendor sudah punya SP aktif
    const existingSP = await this.dbService.vendor_sp.findFirst({
      where: {
        vendor_id: vendorId,
        sp_level: { gte: spLevel },
        status: 1, // AKTIF
        deleted_at: null,
      },
    });

    if (existingSP) {
      // Update total point di SP yang ada
      await this.dbService.vendor_sp.update({
        where: { id: existingSP.id },
        data: {
          total_point: totalPoints,
          updated_by: userId,
          updated_at: new Date(),
        },
      });

      this.logger.log(`SP${existingSP.sp_level} updated for vendor ${vendorId}. Total points: ${totalPoints}`);

      return { spId: existingSP.id, spLevel: existingSP.sp_level };
    }

    // Buat SP baru
    const now = new Date();

    // Hitung 12 minggu ke depan
    const twelveWeeksLater = new Date(now.getTime() + 84 * 24 * 60 * 60 * 1000);
    const nextQuarterStart = this.getNextQuarterStartDate(quarter, year);

    // Jika kurang dari 12 minggu sebelum quartal berikutnya, extend ke 90 hari penuh
    let endDate: Date;
    if (twelveWeeksLater < nextQuarterStart) {
      // Rule: penalti tetap 90 hari meski quartal berganti
      endDate = new Date(now.getTime() + SP_DURATION_DAYS * 24 * 60 * 60 * 1000);
    } else {
      endDate = new Date(now.getTime() + SP_DURATION_DAYS * 24 * 60 * 60 * 1000);
    }

    const allocationReduction = this.getAllocationReduction(spLevel);

    // Buat SP baru
    const newSP = await this.dbService.vendor_sp.create({
      data: {
        vendor_id: vendorId,
        sp_level: spLevel,
        total_point: totalPoints,
        quarter,
        year,
        start_date: now,
        end_date: endDate,
        status: 1, // AKTIF
        allocation_reduction: allocationReduction,
        notes: `SP${spLevel} issued automatically by system. Total points: ${totalPoints}`,
        created_by: userId,
      },
    });

    this.logger.log(
      `SP${spLevel} issued for vendor ${vendorId}. Total points: ${totalPoints}. End date: ${endDate.toISOString()}`,
    );

    // Jika SP3, nonaktifkan vendor
    if (spLevel === 3) {
      await this.dbService.vendor.update({
        where: { id: vendorId },
        data: { is_active: false },
      });

      this.logger.warn(`Vendor ${vendorId} deactivated due to SP3`);

      // Kirim notifikasi ke admin
      await this.sendSPNotification(vendorId, spLevel, totalPoints);
    }

    return { spId: newSP.id, spLevel };
  }

  /**
   * Get next quarter start date
   */
  private getNextQuarterStartDate(currentQuarter: number, currentYear: number): Date {
    const quarterStartMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
    const nextQuarter = currentQuarter === 4 ? 1 : currentQuarter + 1;
    const nextYear = currentQuarter === 4 ? currentYear + 1 : currentYear;
    return new Date(nextYear, quarterStartMonths[nextQuarter - 1], 1);
  }

  /**
   * Get allocation reduction berdasarkan level SP
   */
  private getAllocationReduction(spLevel: number): number {
    switch (spLevel) {
      case 1:
        return SPAllocationReduction.SP1_MAX; // 50%
      case 2:
        return SPAllocationReduction.SP2_MAX; // 75%
      case 3:
        return SPAllocationReduction.SP3; // 100%
      default:
        return 0;
    }
  }

  /**
   * Kirim notifikasi pelanggaran ke vendor
   */
  private async sendViolationNotification(
    vendorId: number,
    violationName: string,
    pointAdded: number,
    totalPoints: number,
  ): Promise<void> {
    try {
      const vendor = await this.dbService.vendor.findFirst({
        where: { id: vendorId },
        include: {
          pic_vendor: {
            include: { users: true },
          },
        },
      });

      if (vendor?.pic_vendor?.[0]?.users) {
        await this.notifService.create(
          {
            title: 'Pelanggaran SLA',
            message: `Anda telah mencatat pelanggaran "${violationName}". +${pointAdded} poin. Total poin Q ini: ${totalPoints}`,
          },
          'VENDOR_VIOLATION',
          vendor.pic_vendor[0].users.id,
          moduleTypeNotification.VENDOR_VIOLATION,
          vendorId,
          1, // status: 1 = active/new notification
        );
      }
    } catch (error) {
      this.logger.error('Failed to send violation notification', error);
    }
  }

  /**
   * Kirim notifikasi SP ke admin
   */
  private async sendSPNotification(
    vendorId: number,
    spLevel: number,
    totalPoints: number,
  ): Promise<void> {
    try {
      const admins = await this.dbService.users.findMany({
        where: {
          roles: {
            name: { in: ['Admin HO', 'Super User'] },
          },
          is_active: true,
          deleted_at: null,
        },
      });

      const vendor = await this.dbService.vendor.findFirst({
        where: { id: vendorId },
      });

      for (const admin of admins) {
        await this.notifService.create(
          {
            title: `Vendor SP${spLevel}`,
            message: `Vendor "${vendor?.company_name}" mencapai ${totalPoints} poin dan mendapatkan SP${spLevel}. Vendor telah dinonaktifkan.`,
          },
          'VENDOR_SP',
          admin.id,
          moduleTypeNotification.VENDOR_SP,
          vendorId,
          1, // status: 1 = active/new notification
        );
      }
    } catch (error) {
      this.logger.error('Failed to send SP notification', error);
    }
  }

  /**
   * Get info SP vendor untuk keperluan alokasi order
   */
  async getVendorSPInfo(vendorId: number): Promise<{
    hasActiveSP: boolean;
    spLevel: number | null;
    spStatus: string | null;
    totalPoints: number | null;
    allocationReduction: number | null;
    canReceiveOrder: boolean;
  }> {
    const now = new Date();

    const activeSP = await this.dbService.vendor_sp.findFirst({
      where: {
        vendor_id: vendorId,
        status: 1, // AKTIF
        end_date: { gte: now },
        deleted_at: null,
      },
      orderBy: { sp_level: 'desc' },
    });

    if (!activeSP) {
      return {
        hasActiveSP: false,
        spLevel: null,
        spStatus: null,
        totalPoints: null,
        allocationReduction: null,
        canReceiveOrder: true,
      };
    }

    const { quarter, year } = this.getCurrentQuarterYear();
    const currentPoints = await this.calculateTotalPoints(vendorId, quarter, year);

    return {
      hasActiveSP: true,
      spLevel: activeSP.sp_level,
      spStatus: `SP${activeSP.sp_level}`,
      totalPoints: currentPoints,
      allocationReduction: activeSP.allocation_reduction,
      canReceiveOrder: activeSP.sp_level < 3,
    };
  }

  /**
   * Count refund untuk vendor dalam quartal tertentu
   */
  async countVendorRefundsInQuarter(
    vendorId: number,
    quarter: number,
    year: number,
  ): Promise<number> {
    const startDate = this.getQuarterStartDate(quarter, year);
    const endDate = this.getQuarterEndDate(quarter, year);

    const count = await this.dbService.refund.count({
      where: {
        orders: {
          vendor_id: vendorId,
          created_at: {
            gte: startDate,
            lte: endDate,
          },
        },
        deleted_at: null,
      },
    });

    return count;
  }

  /**
   * Get quarter start date
   */
  private getQuarterStartDate(quarter: number, year: number): Date {
    const month = (quarter - 1) * 3;
    return new Date(year, month, 1);
  }

  /**
   * Get quarter end date
   */
  private getQuarterEndDate(quarter: number, year: number): Date {
    const month = quarter * 3; // Bulan pertama quartal berikutnya
    return new Date(year, month, 0, 23, 59, 59);
  }

  /**
   * Reset poin vendor (untuk quarterly reset)
   * Catatan: Histori pelanggaran TIDAK dihapus, hanya tidak dihitung lagi
   */
  async resetVendorPoints(vendorId: number): Promise<void> {
    this.logger.log(`Points reset for vendor ${vendorId}`);
    // Poin di-reset dengan tidak menghitung di quarter baru
    // Histori di vendor_violation_log tetap tersimpan
  }

  /**
   * Complete SP yang expired
   */
  async completeExpiredSPs(): Promise<number> {
    const now = new Date();

    const expiredSPs = await this.dbService.vendor_sp.findMany({
      where: {
        status: 1, // AKTIF
        end_date: { lt: now },
        deleted_at: null,
      },
    });

    for (const sp of expiredSPs) {
      await this.dbService.vendor_sp.update({
        where: { id: sp.id },
        data: {
          status: 2, // SELESAI
          updated_at: now,
        },
      });

      this.logger.log(`SP ${sp.id} completed for vendor ${sp.vendor_id}`);
    }

    return expiredSPs.length;
  }

  /**
   * Reaktivasi vendor SP3 yang SP-nya sudah selesai
   * ATTENTION: Ini hanya untuk vendor yang SP-nya sudah expired secara natural
   * Vendor SP3 yang require_ho_reactivation harus diaktifkan manual
   */
  async reactivateExpiredSP3Vendors(): Promise<number> {
    const now = new Date();

    // Cari vendor yang SP3-nya sudah expired
    const expiredSP3s = await this.dbService.vendor_sp.findMany({
      where: {
        sp_level: 3,
        status: 2, // SELESAI
        end_date: { lt: now },
        deleted_at: null,
      },
      include: {
        vendor: true,
      },
    });

    let reactivatedCount = 0;

    for (const sp of expiredSP3s) {
      if (!sp.vendor.is_active) {
        // Aktifkan vendor
        await this.dbService.vendor.update({
          where: { id: sp.vendor_id },
          data: { is_active: true },
        });

        this.logger.log(`Vendor ${sp.vendor_id} auto-reactivated after SP3 expiry`);

        // Log reaktivasi
        await this.dbService.vendor_reactivation_log.create({
          data: {
            vendor_id: sp.vendor_id,
            previous_sp_id: sp.id,
            reason: 'Auto-reaktivasi setelah SP3 expired secara natural',
            approved_by: 0, // System
            status: 2, // APPROVED
          },
        });

        reactivatedCount++;
      }
    }

    return reactivatedCount;
  }
}
