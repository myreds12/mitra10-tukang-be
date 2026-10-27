/* eslint-disable prettier/prettier */
import { Test, TestingModule } from '@nestjs/testing';
import { VendorViolationController } from './vendor-violation.controller';
import { VendorViolationService } from './vendor-violation.service';
import { VendorViolationRevisionService } from './vendor-violation-revision.service';
import { VendorViolationScheduler } from '../scheduler/vendor-violation.scheduler';

describe('VendorViolationController — Manual Trigger Endpoints', () => {
  let controller: VendorViolationController;
  let mockScheduler: any;
  let mockService: any;
  let mockRevisionService: any;

  beforeEach(async () => {
    mockScheduler = {
      handleDailyViolationCheck: jest.fn(),
      handleSPStatusCheck: jest.fn(),
    };
    mockService = {
      getRoleName: jest.fn().mockResolvedValue('Super User'),
    };
    mockRevisionService = {};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorViolationController],
      providers: [
        { provide: VendorViolationService, useValue: mockService },
        { provide: VendorViolationRevisionService, useValue: mockRevisionService },
        { provide: VendorViolationScheduler, useValue: mockScheduler },
      ],
    }).compile();

    controller = module.get<VendorViolationController>(VendorViolationController);
  });

  describe('triggerDailyCheck', () => {
    it('executes handleDailyViolationCheck with force=true and returns formatted response', async () => {
      const mockReport = {
        timestamp: '2026-10-12T00:01:00.000Z',
        durationMs: 50,
        summary: {
          unconfirmedOrders: { checkedCount: 5, recordedCount: 2, skippedCount: 3, errorCount: 0 },
          lateQuotations: { checkedCount: 2, recordedCount: 1, skippedCount: 1, errorCount: 0 },
          staleWorkOrderStatuses: { checkedCount: 0, recordedCount: 0, skippedCount: 0, errorCount: 0 },
          pendingReschedules: { checkedCount: 1, recordedCount: 0, skippedCount: 1, errorCount: 0 },
          totalViolationsRecorded: 3,
        },
        details: [],
      };
      mockScheduler.handleDailyViolationCheck.mockResolvedValue(mockReport);

      const result = await controller.triggerDailyCheck({ id: 99 });

      expect(mockScheduler.handleDailyViolationCheck).toHaveBeenCalledWith(true);
      expect(result).toEqual({
        statusCode: 200,
        message: 'Daily violation check berhasil dijalankan',
        data: mockReport,
      });
    });
  });

  describe('triggerSpStatusCheck', () => {
    it('executes handleSPStatusCheck with force=true and returns formatted response', async () => {
      const mockReport = {
        timestamp: '2026-10-12T01:00:00.000Z',
        durationMs: 25,
        completedSPs: 2,
        reactivatedVendors: 1,
        quarterlyResetExecuted: false,
      };
      mockScheduler.handleSPStatusCheck.mockResolvedValue(mockReport);

      const result = await controller.triggerSpStatusCheck({ id: 99 });

      expect(mockScheduler.handleSPStatusCheck).toHaveBeenCalledWith(true);
      expect(result).toEqual({
        statusCode: 200,
        message: 'SP status check berhasil dijalankan',
        data: mockReport,
      });
    });
  });

  describe('triggerAllChecks', () => {
    it('executes both daily and SP status checks and returns combined report', async () => {
      const mockDailyReport = {
        timestamp: '2026-10-12T00:01:00.000Z',
        durationMs: 40,
        summary: { totalViolationsRecorded: 1 },
      };
      const mockSpReport = {
        timestamp: '2026-10-12T01:00:00.000Z',
        durationMs: 20,
        completedSPs: 0,
        reactivatedVendors: 0,
        quarterlyResetExecuted: false,
      };
      mockScheduler.handleDailyViolationCheck.mockResolvedValue(mockDailyReport);
      mockScheduler.handleSPStatusCheck.mockResolvedValue(mockSpReport);

      const result = await controller.triggerAllChecks({ id: 99 });

      expect(mockScheduler.handleDailyViolationCheck).toHaveBeenCalledWith(true);
      expect(mockScheduler.handleSPStatusCheck).toHaveBeenCalledWith(true);
      expect(result).toEqual({
        statusCode: 200,
        message: 'Semua check scheduler berhasil dijalankan',
        data: {
          dailyViolationCheck: mockDailyReport,
          spStatusCheck: mockSpReport,
        },
      });
    });
  });
});
