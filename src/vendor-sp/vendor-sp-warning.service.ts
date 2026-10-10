/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  evaluateSPWarning,
  getIsoWeekAndYear,
  getIsoWeekRange,
} from '../common/constants/vendor-sp.constant';

@Injectable()
export class VendorSpWarningService {
  constructor(private readonly dbService: PrismaService) {}

  async getVendorsApproachingThreshold(
    quarter?: number,
    year?: number,
    checkDate: Date = new Date(),
  ) {
    const q = quarter ?? Math.ceil((checkDate.getMonth() + 1) / 3);
    const y = year ?? checkDate.getFullYear();
    const { start: weekStart, end: weekEnd } = getIsoWeekRange(checkDate);

    // 1. Cek audit logs untuk idempotency (vendor yang sudah dapat warning minggu ISO ini)
    const warnedLogs = await this.dbService.logs.findMany({
      where: {
        module_type: 'VENDOR_SP_WARNING',
        created_at: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
      select: { module_id: true },
    });
    const warnedVendorIds = new Set(
      warnedLogs
        .map((l) => l.module_id)
        .filter((id): id is number => typeof id === 'number'),
    );

    // 2. Query vendor yang aktif
    const vendors = await this.dbService.vendor.findMany({
      where: {
        is_active: true,
        deleted_at: null,
      },
      include: {
        sp_records: {
          where: {
            status: 1, // Aktif
            deleted_at: null,
            end_date: { gte: checkDate },
          },
          orderBy: { sp_level: 'desc' },
        },
        pic_vendor: {
          where: {
            deleted_at: null,
            users: {
              is_active: true,
              deleted_at: null,
              roles: {
                name: { in: ['Owner Vendor', 'Admin Vendor'] },
              },
            },
          },
          include: {
            users: {
              include: { roles: true },
            },
          },
        },
      },
    });

    const approachingVendors = [];

    for (const v of vendors) {
      // Idempotency: skip jika sudah diberi warning minggu ini
      if (warnedVendorIds.has(v.id)) {
        continue;
      }

      // Skip jika vendor sudah SP3 aktif (sudah maksimal / dinonaktifkan)
      const activeSP = v.sp_records?.[0];
      if (activeSP?.sp_level === 3) {
        continue;
      }

      // Hitung total poin kuartal ini dari vendor_violation_log
      const violations = await this.dbService.vendor_violation_log.findMany({
        where: {
          vendor_id: v.id,
          quarter: q,
          year: y,
          is_active: true,
          deleted_at: null,
        },
        include: {
          violation_type: {
            select: { id: true, code: true, name: true, category: true, point: true },
          },
        },
      });

      const totalPoints = violations.reduce(
        (sum, item) => sum + (item.adjusted_point ?? item.violation_type?.point ?? 0),
        0,
      );

      const evaluation = evaluateSPWarning(totalPoints, activeSP?.sp_level ?? null, v.is_active);

      if (evaluation.shouldWarn) {
        // Buat ringkasan pelanggaran per kategori
        const summaryMap: Record<string, { category: string; count: number; points: number }> = {};
        for (const item of violations) {
          const cat = item.violation_type?.category ?? 'LAINNYA';
          const pts = item.adjusted_point ?? item.violation_type?.point ?? 0;
          if (!summaryMap[cat]) {
            summaryMap[cat] = { category: cat, count: 0, points: 0 };
          }
          summaryMap[cat].count += 1;
          summaryMap[cat].points += pts;
        }

        const picUsers = v.pic_vendor
          .map((pv) => pv.users)
          .filter((u): u is typeof v.pic_vendor[0]['users'] => Boolean(u));

        approachingVendors.push({
          vendorId: v.id,
          vendorName: v.company_name,
          quarter: q,
          year: y,
          currentPoints: totalPoints,
          activeSpLevel: activeSP?.sp_level ?? null,
          targetSpLevel: evaluation.targetSpLevel!,
          threshold: evaluation.threshold!,
          warningThreshold: evaluation.warningThreshold!,
          toleranceRemaining: evaluation.toleranceRemaining!,
          violationCount: violations.length,
          violationSummary: Object.values(summaryMap),
          picUsers,
        });
      }
    }

    return approachingVendors;
  }

  /**
   * [POIN 7] Eksekusi pengiriman notifikasi warning mingguan ke vendor yang mendekati threshold SP.
   * Mencatat notifikasi ke tabel notifications (PIC Vendor) dan audit log ke tabel logs.
   *
   * @param issuerId User ID yang men-trigger (null jika via cron scheduler)
   * @param checkDate Tanggal acuan (default: new Date())
   */
  async sendWeeklyWarningNotifications(issuerId?: number, checkDate: Date = new Date()) {
    const { week: isoWeek, year: isoYear } = getIsoWeekAndYear(checkDate);
    const vendors = await this.getVendorsApproachingThreshold(undefined, undefined, checkDate);

    const notifiedVendors = [];

    for (const v of vendors) {
      const title = `Peringatan: Poin Penalti Mendekati SP${v.targetSpLevel}`;
      const message = `Vendor "${v.vendorName}" telah mencapai ${v.currentPoints} poin penalti pada Q${v.quarter}/${v.year} (mendekati threshold SP${v.targetSpLevel}: ${v.threshold} poin). Sisa toleransi: ${v.toleranceRemaining} poin sebelum sanksi SP${v.targetSpLevel} diterbitkan.`;

      const payload = {
        title,
        message,
        vendor_id: v.vendorId,
        vendor_name: v.vendorName,
        quarter: v.quarter,
        year: v.year,
        iso_week: isoWeek,
        total_points: v.currentPoints,
        target_sp: v.targetSpLevel,
        threshold: v.threshold,
        warning_threshold: v.warningThreshold,
        tolerance_remaining: v.toleranceRemaining,
        violation_count: v.violationCount,
        violation_summary: v.violationSummary,
      };

      // 1. Simpan notifikasi ke tabel notifications untuk setiap PIC Vendor
      if (v.picUsers.length > 0) {
        const notifData = v.picUsers.map((user) => ({
          data: JSON.stringify(payload),
          module_id: v.vendorId,
          action: 'VENDOR_SP_WARNING',
          created_by: issuerId ?? null,
          module_type: 'VENDOR_SP',
          status: 1,
          user_id: user.id,
        }));

        await this.dbService.notifications.createMany({
          data: notifData,
        });
      }

      // 2. Simpan audit log ke tabel logs (idempotency anchor & traceability)
      await this.dbService.logs.create({
        data: {
          module_type: 'VENDOR_SP_WARNING',
          module_id: v.vendorId,
          issuer_type: issuerId ? 'USER' : 'SYSTEM',
          issuer_id: issuerId ?? null,
          properties: JSON.stringify({
            vendor_id: v.vendorId,
            vendor_name: v.vendorName,
            quarter: v.quarter,
            year: v.year,
            iso_week: isoWeek,
            current_points: v.currentPoints,
            target_sp: v.targetSpLevel,
            threshold: v.threshold,
            tolerance_remaining: v.toleranceRemaining,
            notified_user_ids: v.picUsers.map((u) => u.id),
            sent_at: checkDate.toISOString(),
          }),
        },
      });

      notifiedVendors.push({
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        currentPoints: v.currentPoints,
        targetSpLevel: v.targetSpLevel,
        threshold: v.threshold,
        toleranceRemaining: v.toleranceRemaining,
        notifiedUsersCount: v.picUsers.length,
      });
    }

    return {
      success: true,
      message: `Berhasil memproses peringatan mingguan SP vendor. ${notifiedVendors.length} vendor mendekati threshold.`,
      isoWeek,
      isoYear,
      totalApproaching: vendors.length,
      notifiedVendors,
    };
  }
}

