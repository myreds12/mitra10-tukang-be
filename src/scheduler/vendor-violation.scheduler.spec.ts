/* eslint-disable prettier/prettier */
import { Test, TestingModule } from '@nestjs/testing';
import { VendorViolationScheduler } from './vendor-violation.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { ViolationDetectorService } from '../common/services/violation-detector.service';
import { VendorSpService } from '../vendor-sp/vendor-sp.service';
import { ViolationTypeCode } from '../common/enum/violation-type.enum';

describe('VendorViolationScheduler — checkUnconfirmedOrders & checkLateQuotations', () => {
  let scheduler: VendorViolationScheduler;
  let prisma: any;
  let detector: any;
  let vendorSp: any;

  const mockPrisma = {
    orders: {
      findMany: jest.fn(),
    },
    status: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    work_orders: {
      findMany: jest.fn(),
    },
    reschedule: {
      findMany: jest.fn(),
    },
    vendor_sp: {
      findMany: jest.fn(),
    },
    vendor_sp_warning_log: {
      findFirst: jest.fn(),
    },
  };

  const mockDetector = {
    recordViolation: jest.fn(),
    completeExpiredSPs: jest.fn(),
    reactivateExpiredSP3Vendors: jest.fn(),
  };

  const mockVendorSpService = {
    sendWeeklyWarningNotifications: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.NODE_APP_INSTANCE = '0';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorViolationScheduler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ViolationDetectorService, useValue: mockDetector },
        { provide: VendorSpService, useValue: mockVendorSpService },
      ],
    }).compile();

    scheduler = module.get<VendorViolationScheduler>(VendorViolationScheduler);
    prisma = module.get<PrismaService>(PrismaService);
    detector = module.get<ViolationDetectorService>(ViolationDetectorService);
    vendorSp = module.get<VendorSpService>(VendorSpService);
  });

  afterEach(() => {
    delete process.env.NODE_APP_INSTANCE;
  });

  describe('checkUnconfirmedOrders', () => {
    const callCheckUnconfirmedOrders = (instance: VendorViolationScheduler) =>
      (instance as any).checkUnconfirmedOrders();

    it('queries unconfirmed orders with SURVEYREQ and WORKREQ only (excluding TUKANGSURVEY)', async () => {
      mockPrisma.orders.findMany.mockResolvedValue([]);

      await callCheckUnconfirmedOrders(scheduler);

      expect(mockPrisma.orders.findMany).toHaveBeenCalledTimes(1);
      const queryArgs = mockPrisma.orders.findMany.mock.calls[0][0];
      expect(queryArgs.where.status.category.in).toEqual(['SURVEYREQ', 'WORKREQ']);
      expect(queryArgs.where.status.category.in).not.toContain('TUKANGSURVEY');
      expect(queryArgs.include.work_orders).toBe(true);
    });

    it('order masuk kemarin (daysDiff === 1) → trigger ORDER_NOT_CONFIRMED_H', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      mockPrisma.orders.findMany.mockResolvedValue([
        {
          id: 501,
          vendor_id: 10,
          project_number: 'PRJ-501',
          created_at: yesterday,
          work_orders: {
            id: 801,
            created_at: yesterday,
          },
        },
      ]);

      await callCheckUnconfirmedOrders(scheduler);

      expect(mockDetector.recordViolation).toHaveBeenCalledTimes(1);
      expect(mockDetector.recordViolation).toHaveBeenCalledWith(
        ViolationTypeCode.ORDER_NOT_CONFIRMED_H,
        expect.objectContaining({
          vendorId: 10,
          orderId: 501,
          description: expect.stringContaining('Hari H'),
        }),
      );
    });

    it('order masuk 2 hari lalu (daysDiff === 2) → trigger ORDER_NOT_CONFIRMED_H1', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

      mockPrisma.orders.findMany.mockResolvedValue([
        {
          id: 502,
          vendor_id: 10,
          project_number: 'PRJ-502',
          created_at: twoDaysAgo,
          work_orders: {
            id: 802,
            created_at: twoDaysAgo,
          },
        },
      ]);

      await callCheckUnconfirmedOrders(scheduler);

      expect(mockDetector.recordViolation).toHaveBeenCalledWith(
        ViolationTypeCode.ORDER_NOT_CONFIRMED_H1,
        expect.objectContaining({
          vendorId: 10,
          orderId: 502,
          description: expect.stringContaining('H+1'),
        }),
      );
    });

    it('order masuk >= 3 hari lalu (daysDiff >= 3) → trigger ORDER_NOT_CONFIRMED_H_PLUS', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);

      mockPrisma.orders.findMany.mockResolvedValue([
        {
          id: 503,
          vendor_id: 10,
          project_number: 'PRJ-503',
          created_at: threeDaysAgo,
          work_orders: null, // fallback to order.created_at
        },
      ]);

      await callCheckUnconfirmedOrders(scheduler);

      expect(mockDetector.recordViolation).toHaveBeenCalledWith(
        ViolationTypeCode.ORDER_NOT_CONFIRMED_H_PLUS,
        expect.objectContaining({
          vendorId: 10,
          orderId: 503,
          description: expect.stringContaining('lebih dari H+1'),
        }),
      );
    });

    it('order masuk hari ini (daysDiff === 0) → belum telat, tidak dicatat pelanggaran', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      mockPrisma.orders.findMany.mockResolvedValue([
        {
          id: 504,
          vendor_id: 10,
          project_number: 'PRJ-504',
          created_at: today,
          work_orders: {
            id: 804,
            created_at: today,
          },
        },
      ]);

      await callCheckUnconfirmedOrders(scheduler);

      expect(mockDetector.recordViolation).not.toHaveBeenCalled();
    });

    it('menggunakan work_orders.created_at saat berbeda dengan order.created_at', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const fourDaysAgo = new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000);
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      // Order dibuat 4 hari lalu, tapi baru diassign ke vendor kemarin
      mockPrisma.orders.findMany.mockResolvedValue([
        {
          id: 505,
          vendor_id: 10,
          created_at: fourDaysAgo,
          work_orders: {
            id: 805,
            created_at: yesterday,
          },
        },
      ]);

      await callCheckUnconfirmedOrders(scheduler);

      // Evaluasi harus berdasarkan tanggal assign ke vendor (yesterday = daysDiff 1 -> Hari H)
      expect(mockDetector.recordViolation).toHaveBeenCalledWith(
        ViolationTypeCode.ORDER_NOT_CONFIRMED_H,
        expect.anything(),
      );
    });
  });

  describe('checkLateQuotations', () => {
    const callCheckLateQuotations = (instance: VendorViolationScheduler) =>
      (instance as any).checkLateQuotations();

    beforeEach(() => {
      mockPrisma.status.findFirst.mockResolvedValue({ id: 99, category: 'SURVEYDONE' });
      mockPrisma.status.findMany.mockResolvedValue([
        { id: 101, category: 'QUOTEIN' },
        { id: 102, category: 'QUOTEOUT' },
        { id: 103, category: 'QUOTATIONPAID' },
        { id: 104, category: 'QUOTATIONAPPROVED' },
      ]);
    });

    it('Customer A: survey selesai > 3 hari lalu tanpa quotation sama sekali → trigger QUOTATION_LATE_H3', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);

      mockPrisma.orders.findMany.mockResolvedValue([
        {
          id: 601,
          vendor_id: 20,
          project_number: 'PRJ-CUST-A',
          order_history: [{ created_at: fiveDaysAgo, status_id: 99 }],
          quotation: [], // Belum pernah dibuat quotation sama sekali
        },
      ]);

      await callCheckLateQuotations(scheduler);

      expect(mockDetector.recordViolation).toHaveBeenCalledTimes(1);
      expect(mockDetector.recordViolation).toHaveBeenCalledWith(
        ViolationTypeCode.QUOTATION_LATE_H3,
        expect.objectContaining({
          vendorId: 20,
          orderId: 601,
          description: expect.stringContaining('H+3'),
        }),
      );
    });

    it('survey selesai 2 hari lalu (daysSinceSurvey === 2) tanpa quotation → trigger QUOTATION_LATE_H2', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

      mockPrisma.orders.findMany.mockResolvedValue([
        {
          id: 602,
          vendor_id: 20,
          order_history: [{ created_at: twoDaysAgo, status_id: 99 }],
          quotation: [],
        },
      ]);

      await callCheckLateQuotations(scheduler);

      expect(mockDetector.recordViolation).toHaveBeenCalledWith(
        ViolationTypeCode.QUOTATION_LATE_H2,
        expect.objectContaining({
          vendorId: 20,
          orderId: 602,
          description: expect.stringContaining('H+2'),
        }),
      );
    });

    it('survey selesai 1 hari lalu (H+1) → masih dalam toleransi H+2, tidak ada pelanggaran', async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      mockPrisma.orders.findMany.mockResolvedValue([
        {
          id: 603,
          vendor_id: 20,
          order_history: [{ created_at: yesterday, status_id: 99 }],
          quotation: [],
        },
      ]);

      await callCheckLateQuotations(scheduler);

      expect(mockDetector.recordViolation).not.toHaveBeenCalled();
    });

    it('filter query memastikan order yang SUDAH memiliki quotation submitted diabaikan oleh Prisma', async () => {
      mockPrisma.orders.findMany.mockResolvedValue([]);

      await callCheckLateQuotations(scheduler);

      const queryArgs = mockPrisma.orders.findMany.mock.calls[0][0];
      expect(queryArgs.where.order_history.some.status_id).toBe(99);
      expect(queryArgs.where.quotation.none.quotation_status.in).toEqual([101, 102, 103, 104]);
    });
  });
});
