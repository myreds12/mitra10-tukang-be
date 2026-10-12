/* eslint-disable prettier/prettier */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ViolationDetectorService } from '../common/services/violation-detector.service';
import { ViolationTypeCode } from '../common/enum/violation-type.enum';
import { VendorSpService } from '../vendor-sp/vendor-sp.service';

export interface ViolationCheckItem {
  category: string;
  orderId?: number;
  workOrderId?: number;
  rescheduleId?: number;
  quotationId?: number;
  vendorId: number;
  violationCode: string;
  description?: string;
  status: 'RECORDED' | 'ESCALATED' | 'SKIPPED' | 'ERROR';
  pointAdded?: number;
  newTotalPoints?: number;
  message?: string;
}

export interface ViolationCheckCategoryResult {
  checkedCount: number;
  recordedCount: number;
  skippedCount: number;
  errorCount: number;
}

export interface DailyViolationCheckReport {
  timestamp: string;
  durationMs: number;
  summary: {
    unconfirmedOrders: ViolationCheckCategoryResult;
    lateQuotations: ViolationCheckCategoryResult;
    staleWorkOrderStatuses: ViolationCheckCategoryResult;
    pendingReschedules: ViolationCheckCategoryResult;
    totalViolationsRecorded: number;
  };
  details: ViolationCheckItem[];
}

export interface SPStatusCheckReport {
  timestamp: string;
  durationMs: number;
  completedSPs: number;
  reactivatedVendors: number;
  quarterlyResetExecuted: boolean;
}

@Injectable()
export class VendorViolationScheduler implements OnModuleInit {
  private readonly logger = new Logger(VendorViolationScheduler.name);

  constructor(
    private readonly dbService: PrismaService,
    private readonly violationDetector: ViolationDetectorService,
    private readonly vendorSpService: VendorSpService,
  ) {}

  private isPrimaryInstance(): boolean {
    return (process.env.NODE_APP_INSTANCE ?? '0') === '0';
  }

  /**
   * Inisialisasi - check apakah ada quarterly reset yang perlu dilakukan
   */
  async onModuleInit() {
    if (!this.isPrimaryInstance()) return;

    this.logger.log('VendorViolationScheduler initialized');

    // Check quarterly reset saat startup
    await this.checkQuarterlyReset();
  }

  /**
   * CRON JOB 1: Daily Violation Checker
   * Setiap hari jam 00:01 WIB - Cek order tidak dikonfirmasi, quotation telat, status stale, reschedule tertunda.
   * Parameter force: jika true (via API Postman), bypass pengecekan NODE_APP_INSTANCE.
   */
  @Cron('1 0 * * *') // 00:01 every day
  async handleDailyViolationCheck(force = false): Promise<DailyViolationCheckReport> {
    if (!force && !this.isPrimaryInstance()) {
      return {
        timestamp: new Date().toISOString(),
        durationMs: 0,
        summary: {
          unconfirmedOrders: { checkedCount: 0, recordedCount: 0, skippedCount: 0, errorCount: 0 },
          lateQuotations: { checkedCount: 0, recordedCount: 0, skippedCount: 0, errorCount: 0 },
          staleWorkOrderStatuses: { checkedCount: 0, recordedCount: 0, skippedCount: 0, errorCount: 0 },
          pendingReschedules: { checkedCount: 0, recordedCount: 0, skippedCount: 0, errorCount: 0 },
          totalViolationsRecorded: 0,
        },
        details: [],
      };
    }

    this.logger.log('=== Starting Daily Violation Check ===');
    const startTime = Date.now();

    try {
      // 1. Check order yang tidak dikonfirmasi / belum dialokasikan ke tukang
      const unconfirmed = await this.checkUnconfirmedOrders();

      // 2. Check quotation yang terlambat (>H+2, >H+3 sejak Survey Selesai)
      const lateQuotations = await this.checkLateQuotations();

      // 3. Check status order yang tidak diupdate (H+1, >H+2)
      const staleStatuses = await this.checkStaleWorkOrderStatuses();

      // 4. Check reschedule yang belum ditindaklanjuti vendor
      const reschedules = await this.checkPendingReschedules();

      const duration = Date.now() - startTime;
      const totalRecorded =
        unconfirmed.summary.recordedCount +
        lateQuotations.summary.recordedCount +
        staleStatuses.summary.recordedCount +
        reschedules.summary.recordedCount;

      this.logger.log(
        `=== Daily Violation Check completed in ${duration}ms (Total recorded/escalated: ${totalRecorded}) ===`,
      );

      return {
        timestamp: new Date().toISOString(),
        durationMs: duration,
        summary: {
          unconfirmedOrders: unconfirmed.summary,
          lateQuotations: lateQuotations.summary,
          staleWorkOrderStatuses: staleStatuses.summary,
          pendingReschedules: reschedules.summary,
          totalViolationsRecorded: totalRecorded,
        },
        details: [
          ...unconfirmed.items,
          ...lateQuotations.items,
          ...staleStatuses.items,
          ...reschedules.items,
        ],
      };
    } catch (error) {
      this.logger.error('Daily Violation Check failed', error);
      throw error;
    }
  }

  /**
   * CRON JOB 2: SP Status & Maintenance Checker
   * Setiap hari jam 01:00 WIB - Selesaikan SP expired (>90 hari), reaktivasi vendor SP3 yang masa suspend-nya selesai.
   * Parameter force: jika true (via API Postman), bypass pengecekan NODE_APP_INSTANCE.
   */
  @Cron('0 1 * * *') // 01:00 every day
  async handleSPStatusCheck(force = false): Promise<SPStatusCheckReport> {
    if (!force && !this.isPrimaryInstance()) {
      return {
        timestamp: new Date().toISOString(),
        durationMs: 0,
        completedSPs: 0,
        reactivatedVendors: 0,
        quarterlyResetExecuted: false,
      };
    }

    this.logger.log('=== Starting SP Status Check ===');
    const startTime = Date.now();

    try {
      // 1. Complete SP yang expired (>90 hari)
      const completedSPs = await this.violationDetector.completeExpiredSPs();

      // 2. Reaktivasi vendor SP3 yang expired
      const reactivatedVendors = await this.violationDetector.reactivateExpiredSP3Vendors();

      // 3. Cek quarterly reset jika belum tercatat untuk quarter berjalan
      const quarterlyResetExecuted = await this.checkQuarterlyReset();

      if (completedSPs > 0 || reactivatedVendors > 0) {
        this.logger.log(
          `SP Status Check: ${completedSPs} SPs completed, ${reactivatedVendors} vendors reactivated`,
        );
      }

      const duration = Date.now() - startTime;
      this.logger.log(`=== SP Status Check completed in ${duration}ms ===`);

      return {
        timestamp: new Date().toISOString(),
        durationMs: duration,
        completedSPs,
        reactivatedVendors,
        quarterlyResetExecuted: Boolean(quarterlyResetExecuted),
      };
    } catch (error) {
      this.logger.error('SP Status Check failed', error);
      throw error;
    }
  }

  /**
   * CRON JOB 3: Quarterly Reset
   * Hari pertama setiap Quartal jam 00:00 (1 Jan, 1 Apr, 1 Jul, 1 Okt)
   */
  @Cron('0 0 1 1,4,7,10 *') // 00:00 on Jan 1, Apr 1, Jul 1, Oct 1
  async handleQuarterlyReset(force = false) {
    if (!force && !this.isPrimaryInstance()) return;

    this.logger.log('=== Starting Quarterly Reset ===');
    const startTime = Date.now();

    try {
      // 1. Complete SP yang expired
      const completedSPs = await this.violationDetector.completeExpiredSPs();
      this.logger.log(`Completed ${completedSPs} expired SPs`);

      // 2. Reaktivasi vendor SP3 yang expired
      const reactivatedVendors = await this.violationDetector.reactivateExpiredSP3Vendors();
      this.logger.log(`Reactivated ${reactivatedVendors} SP3 vendors`);

      // 3. Log quarterly reset
      await this.logQuarterlyReset();

      const duration = Date.now() - startTime;
      this.logger.log(`=== Quarterly Reset completed in ${duration}ms ===`);
    } catch (error) {
      this.logger.error('Quarterly Reset failed', error);
    }
  }

  /**
   * CRON JOB 4: Weekly Vendor SP Warning
   * Setiap Senin jam 08:00 WIB (01:00 UTC)
   * Kirim notifikasi peringatan ke vendor yang total poin penalty-nya mendekati threshold SP (>= 70%)
   */
  @Cron('0 1 * * 1') // 01:00 UTC every Monday (08:00 WIB)
  async handleWeeklyWarningCheck(force = false) {
    if (!force && !this.isPrimaryInstance()) return;

    this.logger.log('=== Starting Weekly Vendor SP Warning Check ===');
    const startTime = Date.now();

    try {
      const result = await this.vendorSpService.sendWeeklyWarningNotifications();
      const duration = Date.now() - startTime;
      this.logger.log(
        `=== Weekly Vendor SP Warning Check completed in ${duration}ms: ${result.totalApproaching} vendors evaluated ===`,
      );
    } catch (error) {
      this.logger.error('Weekly Vendor SP Warning Check failed', error);
    }
  }

  /**
   * Check order yang tidak dikonfirmasi / belum dialokasikan ke tukang
   * Pelanggaran #1: Tidak terkonfirmasi pada Hari H (ORDER_NOT_CONFIRMED_H)
   * Pelanggaran #2: Tidak terkonfirmasi pada H+1 (ORDER_NOT_CONFIRMED_H1)
   * Pelanggaran #3: Tidak terkonfirmasi pada >H+1 (ORDER_NOT_CONFIRMED_H_PLUS)
   */
  public async checkUnconfirmedOrders(): Promise<{
    summary: ViolationCheckCategoryResult;
    items: ViolationCheckItem[];
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Status yang mengindikasikan order belum dikonfirmasi vendor:
    // SURVEYREQ (order survey belum dialokasikan ke tukang)
    // WORKREQ (order non-survey/pemasangan langsung belum dialokasikan ke tukang)
    const unconfirmedStatuses = ['SURVEYREQ', 'WORKREQ'];

    // Cari order yang:
    // 1. Punya vendor
    // 2. Statusnya belum dikonfirmasi (SURVEYREQ, WORKREQ)
    // 3. Masuk sebelum hari ini (lt: today)
    const orders = await this.dbService.orders.findMany({
      where: {
        vendor_id: { not: null },
        deleted_at: null,
        status: {
          category: { in: unconfirmedStatuses },
        },
        created_at: {
          lt: today,
        },
      },
      include: {
        vendor: true,
        work_orders: true,
      },
    });

    this.logger.log(`Found ${orders.length} unconfirmed orders to check`);

    const summary: ViolationCheckCategoryResult = {
      checkedCount: orders.length,
      recordedCount: 0,
      skippedCount: 0,
      errorCount: 0,
    };
    const items: ViolationCheckItem[] = [];

    for (const order of orders) {
      if (!order.vendor_id) continue;

      // Cek jika order sudah memiliki work_order_tukang aktif (tukang sudah dialokasikan)
      if (order.work_orders?.id && this.dbService.work_order_tukang?.count) {
        const allocatedTukangCount = await this.dbService.work_order_tukang.count({
          where: {
            work_order_id: order.work_orders.id,
            deleted_at: null,
          },
        });
        if (allocatedTukangCount > 0) {
          summary.skippedCount++;
          continue;
        }
      }

      // Basis tanggal: work_orders.created_at (tanggal order masuk ke vendor), fallback ke order.created_at
      const assignedDate = order.work_orders?.created_at
        ? new Date(order.work_orders.created_at)
        : new Date(order.created_at);

      const assignedMidnight = new Date(
        assignedDate.getFullYear(),
        assignedDate.getMonth(),
        assignedDate.getDate(),
      );

      const daysDiff = Math.round(
        (today.getTime() - assignedMidnight.getTime()) / (24 * 60 * 60 * 1000),
      );

      let violationCode: string | null = null;
      let description: string | null = null;

      if (daysDiff >= 3) {
        // >H+1
        violationCode = ViolationTypeCode.ORDER_NOT_CONFIRMED_H_PLUS;
        description = `Order #${order.project_number || order.id} tidak dikonfirmasi lebih dari H+1 (${daysDiff} hari)`;
      } else if (daysDiff === 2) {
        // H+1
        violationCode = ViolationTypeCode.ORDER_NOT_CONFIRMED_H1;
        description = `Order #${order.project_number || order.id} tidak dikonfirmasi pada H+1`;
      } else if (daysDiff === 1) {
        // Hari H (1 hari kalender sejak ditugaskan, hari H baru saja lewat)
        violationCode = ViolationTypeCode.ORDER_NOT_CONFIRMED_H;
        description = `Order #${order.project_number || order.id} tidak dikonfirmasi pada Hari H`;
      }

      if (violationCode) {
        try {
          const res = await this.violationDetector.recordViolation(
            violationCode,
            {
              vendorId: order.vendor_id,
              orderId: order.id,
              description,
              // [POIN 6] SYSTEM_GENERATED — cron job scheduler
              evidence: {
                provenance: 'SYSTEM_GENERATED',
                snapshot: {
                  orderId: order.id,
                  daysSinceAssigned: daysDiff,
                  checkType: 'checkUnconfirmedOrders',
                  tier: violationCode,
                  triggeredAt: new Date().toISOString(),
                },
              },
            },
          );

          if (res.success) {
            summary.recordedCount++;
            items.push({
              category: 'checkUnconfirmedOrders',
              orderId: order.id,
              vendorId: order.vendor_id,
              violationCode,
              description,
              status: res.message?.includes('eskalasi') ? 'ESCALATED' : 'RECORDED',
              pointAdded: res.pointAdded,
              newTotalPoints: res.newTotalPoints,
              message: res.message,
            });
          } else {
            summary.skippedCount++;
            items.push({
              category: 'checkUnconfirmedOrders',
              orderId: order.id,
              vendorId: order.vendor_id,
              violationCode,
              description,
              status: 'SKIPPED',
              pointAdded: 0,
              newTotalPoints: res.newTotalPoints,
              message: res.message,
            });
          }
        } catch (err: any) {
          summary.errorCount++;
          items.push({
            category: 'checkUnconfirmedOrders',
            orderId: order.id,
            vendorId: order.vendor_id,
            violationCode,
            description,
            status: 'ERROR',
            message: err.message,
          });
        }
      }
    }

    return { summary, items };
  }

  /**
   * Check quotation yang terbit terlambat / belum dibuat sejak Survey Selesai
   * Pelanggaran #10: Quotation > H+2 sejak Survey Selesai (QUOTATION_LATE_H2)
   * Pelanggaran #11: Quotation > H+3 sejak Survey Selesai (QUOTATION_LATE_H3)
   */
  public async checkLateQuotations(): Promise<{
    summary: ViolationCheckCategoryResult;
    items: ViolationCheckItem[];
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const summary: ViolationCheckCategoryResult = {
      checkedCount: 0,
      recordedCount: 0,
      skippedCount: 0,
      errorCount: 0,
    };
    const items: ViolationCheckItem[] = [];

    // Status SURVEYDONE
    const surveyDoneStatus = await this.dbService.status.findFirst({
      where: { category: 'SURVEYDONE' },
    });

    if (!surveyDoneStatus) {
      this.logger.warn('SURVEYDONE status not found for late quotation check');
      return { summary, items };
    }

    // Status quotation yang menandakan quotation sudah terbit/disubmit oleh vendor
    const submittedStatuses = await this.dbService.status.findMany({
      where: {
        category: {
          in: ['QUOTEIN', 'QUOTEOUT', 'QUOTATIONPAID', 'QUOTATIONAPPROVED'],
        },
      },
      select: { id: true },
    });
    const submittedStatusIds = submittedStatuses.map((s) => s.id);

    // Cari order yang:
    // 1. Punya vendor
    // 2. Tidak deleted
    // 3. Sudah SURVEYDONE di order_history
    // 4. Belum ada quotation yang disubmit (tidak ada quotation sama sekali, atau hanya DRAFT)
    const orders = await this.dbService.orders.findMany({
      where: {
        vendor_id: { not: null },
        deleted_at: null,
        order_history: {
          some: {
            status_id: surveyDoneStatus.id,
          },
        },
        quotation: {
          none: {
            quotation_status: { in: submittedStatusIds },
            deleted_at: null,
          },
        },
      },
      include: {
        vendor: true,
        order_history: {
          where: { status_id: surveyDoneStatus.id },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
        quotation: {
          where: { deleted_at: null },
          take: 1,
        },
      },
    });

    summary.checkedCount = orders.length;
    this.logger.log(`Found ${orders.length} orders to check for late quotation`);

    for (const order of orders) {
      if (!order.vendor_id) continue;

      const surveyDoneHistory = order.order_history?.[0];
      if (!surveyDoneHistory) continue;

      const surveyDoneDate = new Date(surveyDoneHistory.created_at);
      const surveyMidnight = new Date(
        surveyDoneDate.getFullYear(),
        surveyDoneDate.getMonth(),
        surveyDoneDate.getDate(),
      );

      const daysSinceSurvey = Math.round(
        (today.getTime() - surveyMidnight.getTime()) / (24 * 60 * 60 * 1000),
      );

      let violationCode: string | null = null;

      if (daysSinceSurvey >= 3) {
        // >H+3
        violationCode = ViolationTypeCode.QUOTATION_LATE_H3;
      } else if (daysSinceSurvey === 2) {
        // H+2 (atau > H+2)
        violationCode = ViolationTypeCode.QUOTATION_LATE_H2;
      }

      if (violationCode) {
        const description = `Quotation belum dibuat/terbit selama ${daysSinceSurvey} hari sejak Survey Selesai (limit: ${daysSinceSurvey >= 3 ? 'H+3' : 'H+2'})`;
        try {
          const res = await this.violationDetector.recordViolation(
            violationCode,
            {
              vendorId: order.vendor_id,
              orderId: order.id,
              quotationId: order.quotation?.[0]?.id,
              description,
              // [POIN 6] SYSTEM_GENERATED — cron job scheduler
              evidence: {
                provenance: 'SYSTEM_GENERATED',
                snapshot: {
                  orderId: order.id,
                  daysSinceSurveyDone: daysSinceSurvey,
                  checkType: 'checkLateQuotations',
                  tier: violationCode,
                  triggeredAt: new Date().toISOString(),
                },
              },
            },
          );

          if (res.success) {
            summary.recordedCount++;
            items.push({
              category: 'checkLateQuotations',
              orderId: order.id,
              quotationId: order.quotation?.[0]?.id,
              vendorId: order.vendor_id,
              violationCode,
              description,
              status: res.message?.includes('eskalasi') ? 'ESCALATED' : 'RECORDED',
              pointAdded: res.pointAdded,
              newTotalPoints: res.newTotalPoints,
              message: res.message,
            });
          } else {
            summary.skippedCount++;
            items.push({
              category: 'checkLateQuotations',
              orderId: order.id,
              quotationId: order.quotation?.[0]?.id,
              vendorId: order.vendor_id,
              violationCode,
              description,
              status: 'SKIPPED',
              pointAdded: 0,
              newTotalPoints: res.newTotalPoints,
              message: res.message,
            });
          }
        } catch (err: any) {
          summary.errorCount++;
          items.push({
            category: 'checkLateQuotations',
            orderId: order.id,
            quotationId: order.quotation?.[0]?.id,
            vendorId: order.vendor_id,
            violationCode,
            description,
            status: 'ERROR',
            message: err.message,
          });
        }
      }
    }

    return { summary, items };
  }

  /**
   * Check work order yang statusnya tidak diupdate
   * Pelanggaran #13: Tidak update status order di H, H+1, >H+2
   */
  public async checkStaleWorkOrderStatuses(): Promise<{
    summary: ViolationCheckCategoryResult;
    items: ViolationCheckItem[];
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Status yang perlu diupdate oleh vendor/tukang
    const activeStatuses = [
      'WORKSTART',
      'TUKANGWORK',
      'TUKANGWORKSTEPONE',
      'TUKANGWORKSTEPTWO',
      'TUKANGWORKSTEPTHREE',
    ];

    // Cari work orders yang statusnya tidak berubah > 2 hari
    const workOrders = await this.dbService.work_orders.findMany({
      where: {
        deleted_at: null,
        status: {
          category: { in: activeStatuses },
        },
      },
      include: {
        order: true,
        work_order_status: {
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });

    const summary: ViolationCheckCategoryResult = {
      checkedCount: workOrders.length,
      recordedCount: 0,
      skippedCount: 0,
      errorCount: 0,
    };
    const items: ViolationCheckItem[] = [];

    this.logger.log(`Found ${workOrders.length} active work orders to check for stale status`);

    for (const wo of workOrders) {
      if (!wo.order?.vendor_id) continue;

      const lastStatusUpdate = wo.work_order_status?.[0]?.created_at;

      if (!lastStatusUpdate) continue;

      const lastUpdate = new Date(lastStatusUpdate);
      const daysSinceUpdate = Math.floor(
        (today.getTime() - lastUpdate.getTime()) / (24 * 60 * 60 * 1000),
      );

      let violationCode: string | null = null;

      if (daysSinceUpdate >= 2) {
        // >H+2
        violationCode = ViolationTypeCode.STATUS_NOT_UPDATED_H_PLUS;
      } else if (daysSinceUpdate === 1) {
        // H+1
        violationCode = ViolationTypeCode.STATUS_NOT_UPDATED_H1;
      }

      if (violationCode) {
        const description = `Status work order tidak diupdate selama ${daysSinceUpdate} hari`;
        try {
          const res = await this.violationDetector.recordViolation(
            violationCode,
            {
              vendorId: wo.order.vendor_id,
              orderId: wo.order_id,
              workOrderId: wo.id,
              description,
              // [POIN 6] SYSTEM_GENERATED — cron job scheduler
              evidence: {
                provenance: 'SYSTEM_GENERATED',
                snapshot: {
                  workOrderId: wo.id,
                  orderId: wo.order_id,
                  daysSinceUpdate,
                  checkType: 'checkStaleWorkOrderStatuses',
                  triggeredAt: new Date().toISOString(),
                },
              },
            },
          );

          if (res.success) {
            summary.recordedCount++;
            items.push({
              category: 'checkStaleWorkOrderStatuses',
              orderId: wo.order_id,
              workOrderId: wo.id,
              vendorId: wo.order.vendor_id,
              violationCode,
              description,
              status: res.message?.includes('eskalasi') ? 'ESCALATED' : 'RECORDED',
              pointAdded: res.pointAdded,
              newTotalPoints: res.newTotalPoints,
              message: res.message,
            });
          } else {
            summary.skippedCount++;
            items.push({
              category: 'checkStaleWorkOrderStatuses',
              orderId: wo.order_id,
              workOrderId: wo.id,
              vendorId: wo.order.vendor_id,
              violationCode,
              description,
              status: 'SKIPPED',
              pointAdded: 0,
              newTotalPoints: res.newTotalPoints,
              message: res.message,
            });
          }
        } catch (err: any) {
          summary.errorCount++;
          items.push({
            category: 'checkStaleWorkOrderStatuses',
            orderId: wo.order_id,
            workOrderId: wo.id,
            vendorId: wo.order.vendor_id,
            violationCode,
            description,
            status: 'ERROR',
            message: err.message,
          });
        }
      }
    }

    return { summary, items };
  }

  /**
   * Check reschedule yang belum ditindaklanjuti vendor sejak diajukan.
   * Pelanggaran #4: Tidak update status order sejak tanggal reschedule diajukan
   */
  public async checkPendingReschedules(): Promise<{
    summary: ViolationCheckCategoryResult;
    items: ViolationCheckItem[];
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const reschedules = await this.dbService.reschedule.findMany({
      where: {
        deleted_at: null,
        confirm_date: null,
        created_at: { lte: yesterday },
        status: {
          category: {
            notIn: [
              'RESCHEDULEAPPROVEDBYVENDOR',
              'RESCHEDULEREJECTEDBYVENDOR',
              'RESCHEDULEAPPROVEDBYHO',
            ],
          },
        },
      },
      include: {
        order: true,
        status: true,
      },
    });

    const summary: ViolationCheckCategoryResult = {
      checkedCount: reschedules.length,
      recordedCount: 0,
      skippedCount: 0,
      errorCount: 0,
    };
    const items: ViolationCheckItem[] = [];

    this.logger.log(`Found ${reschedules.length} pending reschedules to check`);

    for (const reschedule of reschedules) {
      if (!reschedule.order?.vendor_id) continue;

      const createdAt = new Date(reschedule.created_at);
      const daysDiff = Math.floor(
        (today.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000),
      );

      if (daysDiff < 1) continue;

      const description = `Reschedule #${reschedule.id} belum ditindaklanjuti vendor selama ${daysDiff} hari`;
      try {
        const res = await this.violationDetector.recordViolation(
          ViolationTypeCode.RESCHEDULE_NOT_UPDATED,
          {
            vendorId: reschedule.order.vendor_id,
            orderId: reschedule.order_id,
            rescheduleId: reschedule.id,
            description,
            // [POIN 6] SYSTEM_GENERATED — cron job scheduler
            evidence: {
              provenance: 'SYSTEM_GENERATED',
              snapshot: {
                rescheduleId: reschedule.id,
                orderId: reschedule.order_id,
                daysSinceCreated: daysDiff,
                checkType: 'checkPendingReschedules',
                triggeredAt: new Date().toISOString(),
              },
            },
          },
        );

        if (res.success) {
          summary.recordedCount++;
          items.push({
            category: 'checkPendingReschedules',
            orderId: reschedule.order_id,
            rescheduleId: reschedule.id,
            vendorId: reschedule.order.vendor_id,
            violationCode: ViolationTypeCode.RESCHEDULE_NOT_UPDATED,
            description,
            status: 'RECORDED',
            pointAdded: res.pointAdded,
            newTotalPoints: res.newTotalPoints,
            message: res.message,
          });
        } else {
          summary.skippedCount++;
          items.push({
            category: 'checkPendingReschedules',
            orderId: reschedule.order_id,
            rescheduleId: reschedule.id,
            vendorId: reschedule.order.vendor_id,
            violationCode: ViolationTypeCode.RESCHEDULE_NOT_UPDATED,
            description,
            status: 'SKIPPED',
            pointAdded: 0,
            newTotalPoints: res.newTotalPoints,
            message: res.message,
          });
        }
      } catch (err: any) {
        summary.errorCount++;
        items.push({
          category: 'checkPendingReschedules',
          orderId: reschedule.order_id,
          rescheduleId: reschedule.id,
          vendorId: reschedule.order.vendor_id,
          violationCode: ViolationTypeCode.RESCHEDULE_NOT_UPDATED,
          description,
          status: 'ERROR',
          message: err.message,
        });
      }
    }

    return { summary, items };
  }

  /**
   * Check apakah perlu quarterly reset (saat startup atau dipanggil manual)
   */
  public async checkQuarterlyReset(): Promise<boolean> {
    const now = new Date();
    const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);

    // Cek apakah ada log quarterly reset untuk quartal ini
    const lastReset = await this.dbService.logs.findFirst({
      where: {
        module_type: 'QUARTERLY_RESET',
        properties: { contains: `Q${currentQuarter}` },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!lastReset) {
      // Quarterly reset belum dilakukan untuk quartal ini
      await this.handleQuarterlyReset(true);
      return true;
    }
    return false;
  }

  /**
   * Log quarterly reset
   */
  private async logQuarterlyReset() {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const year = now.getFullYear();

    await this.dbService.logs.create({
      data: {
        module_type: 'QUARTERLY_RESET',
        properties: JSON.stringify({
          quarter,
          year,
          reset_at: now.toISOString(),
        }),
      },
    });
  }
}
