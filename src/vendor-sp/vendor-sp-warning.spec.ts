import { Test, TestingModule } from '@nestjs/testing';
import { VendorSpService } from './vendor-sp.service';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../common/services/pdf.service';
import { ReportQueryHelper } from './helpers/report-query.helper';
import {
  WARNING_THRESHOLD_PERCENTAGE,
  evaluateSPWarning,
  getIsoWeekAndYear,
  getIsoWeekRange,
} from '../common/constants/vendor-sp.constant';

describe('Vendor SP Warning Logic (Poin 7)', () => {
  describe('evaluateSPWarning() pure helper', () => {
    it('should have centralized WARNING_THRESHOLD_PERCENTAGE equal to 0.7', () => {
      expect(WARNING_THRESHOLD_PERCENTAGE).toBe(0.7);
    });

    it('should WARN vendor with exactly 22 points (>= 70% threshold of SP1 = 31)', () => {
      const result = evaluateSPWarning(22, null, true);
      expect(result.shouldWarn).toBe(true);
      expect(result.targetSpLevel).toBe(1);
      expect(result.threshold).toBe(31);
      expect(result.warningThreshold).toBe(22);
      expect(result.toleranceRemaining).toBe(9);
    });

    it('should NOT warn vendor with 21 points (< 22 points approaching SP1)', () => {
      const result = evaluateSPWarning(21, null, true);
      expect(result.shouldWarn).toBe(false);
      expect(result.targetSpLevel).toBe(1);
      expect(result.warningThreshold).toBe(22);
    });

    it('should WARN vendor with exactly 29 points at SP1 (>= 70% threshold of SP2 = 41)', () => {
      const result = evaluateSPWarning(29, 1, true);
      expect(result.shouldWarn).toBe(true);
      expect(result.targetSpLevel).toBe(2);
      expect(result.threshold).toBe(41);
      expect(result.warningThreshold).toBe(29);
      expect(result.toleranceRemaining).toBe(12);
    });

    it('should WARN vendor with exactly 36 points (>= 70% threshold of SP3 = 51)', () => {
      const result = evaluateSPWarning(36, 2, true);
      expect(result.shouldWarn).toBe(true);
      expect(result.targetSpLevel).toBe(3);
      expect(result.threshold).toBe(51);
      expect(result.warningThreshold).toBe(36);
      expect(result.toleranceRemaining).toBe(15);
    });

    it('should NOT warn vendor with 35 points (< 36 points approaching SP3)', () => {
      const result = evaluateSPWarning(35, 2, true);
      expect(result.shouldWarn).toBe(false);
      expect(result.targetSpLevel).toBe(3);
      expect(result.warningThreshold).toBe(36);
    });

    it('should NOT warn vendor with 0 points (clean vendor)', () => {
      const result = evaluateSPWarning(0, null, true);
      expect(result.shouldWarn).toBe(false);
      expect(result.reason).toContain('0 violation points');
    });

    it('should EXCLUDE vendor already at SP3 (sp_level === 3)', () => {
      const result = evaluateSPWarning(45, 3, true);
      expect(result.shouldWarn).toBe(false);
      expect(result.reason).toContain('already reached SP3');
    });

    it('should EXCLUDE vendor with points >= 51 (already SP3 threshold)', () => {
      const result = evaluateSPWarning(51, null, true);
      expect(result.shouldWarn).toBe(false);
      expect(result.reason).toContain('already reached SP3');
    });

    it('should EXCLUDE inactive vendor', () => {
      const result = evaluateSPWarning(25, null, false);
      expect(result.shouldWarn).toBe(false);
      expect(result.reason).toContain('inactive');
    });
  });

  describe('VendorSpService.getVendorsApproachingThreshold()', () => {
    let service: VendorSpService;

    const mockPrismaService = {
      logs: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      vendor: {
        findMany: jest.fn(),
      },
      vendor_violation_log: {
        findMany: jest.fn(),
      },
      notifications: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => await cb(mockPrismaService)),
    };

    const mockPdfService = {
      pipeAndSave: jest.fn(),
    };

    const mockReportQueryHelper = {
      countVendorOrdersInQuarter: jest.fn(),
      getViolationLogDetails: jest.fn(),
      getSpByVendorAndQuarter: jest.fn(),
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          VendorSpService,
          {
            provide: PrismaService,
            useValue: mockPrismaService,
          },
          {
            provide: PdfService,
            useValue: mockPdfService,
          },
          {
            provide: ReportQueryHelper,
            useValue: mockReportQueryHelper,
          },
        ],
      }).compile();

      service = module.get<VendorSpService>(VendorSpService);
      jest.clearAllMocks();
    });

    it('should include boundary vendors (22 & 36 pts), exclude below-boundary (21 & 35 pts), exclude SP3, exclude 0 pts, and exclude already-warned vendors', async () => {
      const fixedDate = new Date('2026-10-05T08:00:00Z'); // Monday of week 41

      mockPrismaService.logs.findMany.mockResolvedValue([
        { module_id: 5 }, // Vendor 5 already warned this ISO week
      ]);

      mockPrismaService.vendor.findMany.mockResolvedValue([
        {
          id: 1,
          company_name: 'Vendor Satu (22 pts)',
          is_active: true,
          sp_records: [],
          pic_vendor: [
            {
              users: { id: 101, username: 'pic_v1', roles: { name: 'Owner Vendor' } },
            },
          ],
        },
        {
          id: 2,
          company_name: 'Vendor Dua (21 pts)',
          is_active: true,
          sp_records: [],
          pic_vendor: [
            {
              users: { id: 102, username: 'pic_v2', roles: { name: 'Owner Vendor' } },
            },
          ],
        },
        {
          id: 3,
          company_name: 'Vendor Tiga (36 pts SP2)',
          is_active: true,
          sp_records: [{ id: 30, sp_level: 2, status: 1 }],
          pic_vendor: [
            {
              users: { id: 103, username: 'pic_v3', roles: { name: 'Admin Vendor' } },
            },
          ],
        },
        {
          id: 4,
          company_name: 'Vendor Empat (35 pts SP2)',
          is_active: true,
          sp_records: [{ id: 40, sp_level: 2, status: 1 }],
          pic_vendor: [
            {
              users: { id: 104, username: 'pic_v4', roles: { name: 'Admin Vendor' } },
            },
          ],
        },
        {
          id: 5,
          company_name: 'Vendor Lima (22 pts - Already Warned)',
          is_active: true,
          sp_records: [],
          pic_vendor: [
            {
              users: { id: 105, username: 'pic_v5', roles: { name: 'Owner Vendor' } },
            },
          ],
        },
        {
          id: 6,
          company_name: 'Vendor Enam (Active SP3)',
          is_active: true,
          sp_records: [{ id: 60, sp_level: 3, status: 1 }],
          pic_vendor: [],
        },
        {
          id: 7,
          company_name: 'Vendor Tujuh (0 pts)',
          is_active: true,
          sp_records: [],
          pic_vendor: [],
        },
      ]);

      mockPrismaService.vendor_violation_log.findMany.mockImplementation(
        async ({ where }: any) => {
          if (where.vendor_id === 1) {
            return [
              {
                id: 1,
                adjusted_point: null,
                violation_type: { id: 1, code: 'LATE', name: 'Late', category: 'KONFIRMASI_ORDER', point: 22 },
              },
            ];
          }
          if (where.vendor_id === 2) {
            return [
              {
                id: 2,
                adjusted_point: null,
                violation_type: { id: 2, code: 'LATE', name: 'Late', category: 'KONFIRMASI_ORDER', point: 21 },
              },
            ];
          }
          if (where.vendor_id === 3) {
            return [
              {
                id: 3,
                adjusted_point: null,
                violation_type: { id: 3, code: 'REFUND', name: 'Refund', category: 'REFUND', point: 36 },
              },
            ];
          }
          if (where.vendor_id === 4) {
            return [
              {
                id: 4,
                adjusted_point: null,
                violation_type: { id: 4, code: 'REFUND', name: 'Refund', category: 'REFUND', point: 35 },
              },
            ];
          }
          if (where.vendor_id === 5) {
            return [
              {
                id: 5,
                adjusted_point: null,
                violation_type: { id: 1, code: 'LATE', name: 'Late', category: 'KONFIRMASI_ORDER', point: 22 },
              },
            ];
          }
          if (where.vendor_id === 7) {
            return [];
          }
          return [];
        },
      );

      const result = await service.getVendorsApproachingThreshold(4, 2026, fixedDate);

      expect(result).toHaveLength(2);

      const vendorIds = result.map((r) => r.vendorId);
      expect(vendorIds).toContain(1);
      expect(vendorIds).toContain(3);

      expect(vendorIds).not.toContain(2);
      expect(vendorIds).not.toContain(4);
      expect(vendorIds).not.toContain(5);
      expect(vendorIds).not.toContain(6);
      expect(vendorIds).not.toContain(7);

      const v1 = result.find((r) => r.vendorId === 1)!;
      expect(v1.currentPoints).toBe(22);
      expect(v1.targetSpLevel).toBe(1);
      expect(v1.threshold).toBe(31);
      expect(v1.toleranceRemaining).toBe(9);
      expect(v1.picUsers).toHaveLength(1);

      const v3 = result.find((r) => r.vendorId === 3)!;
      expect(v3.currentPoints).toBe(36);
      expect(v3.targetSpLevel).toBe(3);
      expect(v3.threshold).toBe(51);
      expect(v3.toleranceRemaining).toBe(15);
      expect(v3.picUsers).toHaveLength(1);
    });
  });

  describe('VendorSpService.sendWeeklyWarningNotifications()', () => {
    let service: VendorSpService;

    const mockPrismaService = {
      logs: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      vendor: {
        findMany: jest.fn(),
      },
      vendor_violation_log: {
        findMany: jest.fn(),
      },
      notifications: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => await cb(mockPrismaService)),
    };

    const mockPdfService = {
      pipeAndSave: jest.fn(),
    };

    const mockReportQueryHelper = {
      countVendorOrdersInQuarter: jest.fn(),
      getViolationLogDetails: jest.fn(),
      getSpByVendorAndQuarter: jest.fn(),
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          VendorSpService,
          {
            provide: PrismaService,
            useValue: mockPrismaService,
          },
          {
            provide: PdfService,
            useValue: mockPdfService,
          },
          {
            provide: ReportQueryHelper,
            useValue: mockReportQueryHelper,
          },
        ],
      }).compile();

      service = module.get<VendorSpService>(VendorSpService);
      jest.clearAllMocks();
    });

    it('should create notifications for PIC Vendor and write audit log for each warned vendor', async () => {
      const fixedDate = new Date('2026-10-05T08:00:00Z');

      mockPrismaService.logs.findMany.mockResolvedValue([]);
      mockPrismaService.vendor.findMany.mockResolvedValue([
        {
          id: 10,
          company_name: 'PT Vendor Mandiri',
          is_active: true,
          sp_records: [],
          pic_vendor: [
            {
              users: { id: 201, username: 'owner_vm', roles: { name: 'Owner Vendor' } },
            },
            {
              users: { id: 202, username: 'admin_vm', roles: { name: 'Admin Vendor' } },
            },
          ],
        },
      ]);

      mockPrismaService.vendor_violation_log.findMany.mockResolvedValue([
        {
          id: 101,
          adjusted_point: null,
          violation_type: { id: 1, code: 'LATE', name: 'Late', category: 'KONFIRMASI_ORDER', point: 22 },
        },
      ]);

      const result = await service.sendWeeklyWarningNotifications(999, fixedDate);

      expect(result.success).toBe(true);
      expect(result.totalApproaching).toBe(1);
      expect(result.notifiedVendors).toHaveLength(1);

      expect(mockPrismaService.notifications.createMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.notifications.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            module_id: 10,
            module_type: 'VENDOR_SP',
            action: 'VENDOR_SP_WARNING',
            user_id: 201,
            created_by: 999,
          }),
          expect.objectContaining({
            module_id: 10,
            module_type: 'VENDOR_SP',
            action: 'VENDOR_SP_WARNING',
            user_id: 202,
            created_by: 999,
          }),
        ]),
      });

      expect(mockPrismaService.logs.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.logs.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          module_type: 'VENDOR_SP_WARNING',
          module_id: 10,
          issuer_type: 'USER',
          issuer_id: 999,
        }),
      });

      const logCall = mockPrismaService.logs.create.mock.calls[0][0];
      const parsedProps = JSON.parse(logCall.data.properties);
      expect(parsedProps.vendor_id).toBe(10);
      expect(parsedProps.current_points).toBe(22);
      expect(parsedProps.target_sp).toBe(1);
      expect(parsedProps.threshold).toBe(31);
      expect(parsedProps.tolerance_remaining).toBe(9);
      expect(parsedProps.notified_user_ids).toEqual([201, 202]);
    });
  });
});
