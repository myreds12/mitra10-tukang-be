/* eslint-disable prettier/prettier */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ViolationTypeCode,
  ViolationCategory,
  SPThreshold,
  SPAllocationReduction,
  SP_DURATION_DAYS,
  ViolationContext,
  ViolationEvidence,
  ViolationResult,
} from '../../common/enum/violation-type.enum';
import { NotificationsService } from '../../notifications/notifications.service';
import { moduleTypeNotification } from '../../notifications/dto/notification-module-type.enum';
import { syncVendorSpDetails } from '../../common/utils/vendor-sp-detail-sync.util';

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
   * @param context Context pelanggaran (vendorId, orderId, evidence, dll).
   *   [POIN 6] `context.evidence` WAJIB diisi — MANUAL_UPLOAD (path) atau
   *   SYSTEM_GENERATED (snapshot). Throw BadRequestException kalau kosong/invalid.
   * @param userId User yang mencatat (opsional)
   */
  async recordViolation(
    violationCode: string,
    context: ViolationContext,
    userId?: number,
  ): Promise<ViolationResult> {
    if (process.env.VENDOR_SP_ENABLED !== 'true') {
      return {
        success: false,
        pointAdded: 0,
        newTotalPoints: 0,
        message: 'Vendor SP feature is disabled',
      };
    }

    // [POIN 6] Lapis 2 guard: validate evidence WAJIB ada dan valid.
    // Kalau kosong → throw BadRequestException (data tidak akan tersimpan).
    const { evidencePath, evidenceProvenance } = this.resolveEvidence(context.evidence);

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
          evidence_path: evidencePath,
          evidence_provenance: evidenceProvenance,
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
   * [POIN 6] Resolve + validate evidence dari context.evidence.
   * - Kalau evidence undefined / provenance tidak valid → throw BadRequestException.
   * - MANUAL_UPLOAD → butuh `path` non-empty string.
   * - SYSTEM_GENERATED → butuh `snapshot` non-empty object.
   * Return tuple: (evidencePath_to_persist, provenance_to_persist).
   *   Untuk SYSTEM_GENERATED, evidence_path berisi JSON.stringify(snapshot).
   */
  private resolveEvidence(evidence: ViolationEvidence | undefined | null): {
    evidencePath: string | null;
    evidenceProvenance: 'MANUAL_UPLOAD' | 'SYSTEM_GENERATED';
  } {
    if (!evidence || typeof evidence !== 'object') {
      throw new BadRequestException(
        'Evidence wajib diisi untuk mencatat pelanggaran. Gunakan { provenance: "MANUAL_UPLOAD", path } atau { provenance: "SYSTEM_GENERATED", snapshot }.',
      );
    }

    if (evidence.provenance === 'MANUAL_UPLOAD') {
      const path = (evidence as any).path;
      if (!path || typeof path !== 'string' || path.trim() === '') {
        throw new BadRequestException(
          'Evidence MANUAL_UPLOAD wajib menyertakan path (string non-empty).',
        );
      }
      return { evidencePath: path.trim(), evidenceProvenance: 'MANUAL_UPLOAD' };
    }

    if (evidence.provenance === 'SYSTEM_GENERATED') {
      const snapshot = (evidence as any).snapshot;
      if (
        !snapshot ||
        typeof snapshot !== 'object' ||
        Array.isArray(snapshot) ||
        Object.keys(snapshot).length === 0
      ) {
        throw new BadRequestException(
          'Evidence SYSTEM_GENERATED wajib menyertakan snapshot (object non-empty).',
        );
      }
      return {
        evidencePath: JSON.stringify(snapshot),
        evidenceProvenance: 'SYSTEM_GENERATED',
      };
    }

    throw new BadRequestException(
      `Evidence provenance tidak valid: ${(evidence as any).provenance}. ` +
        `Harus MANUAL_UPLOAD atau SYSTEM_GENERATED.`,
    );
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
   *
   * ATOMICITY: vendor_sp + vendor_sp_detail + vendor.is_active dijalankan
   * dalam satu Prisma transaction.
   *
   * NOTIFICATION: sendSPNotification dipanggil HANYA setelah transaction
   * commit berhasil dan HANYA untuk SP3 baru (bukan update SP existing,
   * bukan SP1/SP2). Kegagalan notifikasi di-catch terpisah agar tidak
   * menggulingkan response yang sebenarnya sudah sukses.
   */
  private async checkAndIssueSP(
    vendorId: number,
    totalPoints: number,
    quarter: number,
    year: number,
    userId?: number,
  ): Promise<{ spId: number; spLevel: number } | undefined> {
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

    type Outcome =
      | { kind: 'updated'; spId: number; spLevel: number }
      | { kind: 'issued'; spId: number; spLevel: number };

    let outcome: Outcome;
    try {
      outcome = await this.dbService.$transaction(async (tx) => {
        const existingSP = await tx.vendor_sp.findFirst({
          where: {
            vendor_id: vendorId,
            sp_level: { gte: spLevel! },
            status: 1,
            deleted_at: null,
          },
        });

        if (existingSP) {
          await tx.vendor_sp.update({
            where: { id: existingSP.id },
            data: {
              total_point: totalPoints,
              updated_by: userId,
              updated_at: new Date(),
            },
          });
          const detail = await syncVendorSpDetails(tx, {
            vendorSpId: existingSP.id,
            vendorId,
            quarter,
            year,
            createdBy: userId ?? null,
          });
          this.logger.log(
            `[detector][SP update] vendor=${vendorId} level=SP${spLevel} spId=${existingSP.id} Q${quarter}/${year} linked=${detail.totalLinked} newLinked=${detail.inserted}`,
          );
          return {
            kind: 'updated',
            spId: existingSP.id,
            spLevel: existingSP.sp_level,
          } satisfies Outcome;
        }

        const now = new Date();
        const twelveWeeksLater = new Date(
          now.getTime() + 84 * 24 * 60 * 60 * 1000,
        );
        const nextQuarterStart = this.getNextQuarterStartDate(quarter, year);

        let endDate: Date;
        if (twelveWeeksLater < nextQuarterStart) {
          endDate = new Date(
            now.getTime() + SP_DURATION_DAYS * 24 * 60 * 60 * 1000,
          );
        } else {
          endDate = new Date(
            now.getTime() + SP_DURATION_DAYS * 24 * 60 * 60 * 1000,
          );
        }

        const allocationReduction = this.getAllocationReduction(spLevel!);

        const newSP = await tx.vendor_sp.create({
          data: {
            vendor_id: vendorId,
            sp_level: spLevel!,
            total_point: totalPoints,
            quarter,
            year,
            start_date: now,
            end_date: endDate,
            status: 1,
            allocation_reduction: allocationReduction,
            notes: `SP${spLevel} issued automatically by system. Total points: ${totalPoints}`,
            created_by: userId,
          },
        });

        const detail = await syncVendorSpDetails(tx, {
          vendorSpId: newSP.id,
          vendorId,
          quarter,
          year,
          createdBy: userId ?? null,
        });

        this.logger.log(
          `[detector][SP issued] vendor=${vendorId} level=SP${spLevel} spId=${newSP.id} Q${quarter}/${year} linked=${detail.totalLinked} newLinked=${detail.inserted}`,
        );

        if (spLevel === 3) {
          await tx.vendor.update({
            where: { id: vendorId },
            data: { is_active: false },
          });
          this.logger.warn(`Vendor ${vendorId} deactivated due to SP3`);
        }

        return {
          kind: 'issued',
          spId: newSP.id,
          spLevel,
        } satisfies Outcome;
      });
    } catch (error) {
      this.logger.error(
        `checkAndIssueSP failed: vendor=${vendorId} spLevel=SP${spLevel} Q${quarter}/${year} reason=${(error as Error)?.message ?? String(error)}`,
        (error as Error)?.stack,
      );
      throw error;
    }

    if (outcome.kind === 'issued' && outcome.spLevel === 3) {
      try {
        await this.sendSPNotification(vendorId, outcome.spLevel, totalPoints);
      } catch (notifErr) {
        this.logger.warn(
          `sendSPNotification failed (already-committed SP) vendor=${vendorId} spId=${outcome.spId} reason=${(notifErr as Error)?.message ?? String(notifErr)}`,
        );
      }
    }

    return { spId: outcome.spId, spLevel: outcome.spLevel };
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
