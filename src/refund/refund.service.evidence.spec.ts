/* eslint-disable prettier/prettier */
import { Test, TestingModule } from '@nestjs/testing';
import { RefundService } from './refund.service';
import { ViolationDetectorService } from '../common/services/violation-detector.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderService } from '../order/order.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * [POIN 6] Callsite test untuk RefundService — verifikasi evidence
 * SYSTEM_GENERATED ter-attach dengan benar ketika vendor mencapai
 * threshold refund per quarter.
 *
 * Setup minimal: mock PrismaService + ViolationDetectorService sebagai spy
 * untuk verifikasi call args. OrderService dimock karena dipakai di
 * checkRefundViolation flow.
 */
describe('RefundService — POIN 6 callsite evidence', () => {
  let service: RefundService;
  let violationDetectorSpy: {
    countVendorRefundsInQuarter: jest.Mock;
    recordViolation: jest.Mock;
  };
  let prismaMock: any;

  beforeEach(async () => {
    violationDetectorSpy = {
      countVendorRefundsInQuarter: jest.fn(),
      recordViolation: jest.fn().mockResolvedValue(undefined),
    };
    prismaMock = {
      refund: {
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      vendor: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          company_name: 'Test Vendor',
          deleted_at: null,
        }),
      },
      order: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RefundService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ViolationDetectorService, useValue: violationDetectorSpy },
        // OrderService & NotificationsService dimock minimal karena dipakai di flow
        {
          provide: OrderService,
          useValue: { setStatus: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: NotificationsService,
          useValue: { create: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = moduleRef.get<RefundService>(RefundService);
  });

  it('REFUND_5_PER_QUARTER → recordViolation dipanggil dengan SYSTEM_GENERATED + snapshot lengkap', async () => {
    // Setup: count = 5 (trigger threshold REFUND_5_PER_QUARTER)
    violationDetectorSpy.countVendorRefundsInQuarter.mockResolvedValue(5);

    const order = { id: 100, vendor_id: 1, project_number: 'PRJ-001' };
    const refund = { id: 50 };

    // Access private method via cast untuk trigger callsite
    await (service as unknown as {
      checkRefundViolation: (o: any, r: any) => Promise<void>;
    }).checkRefundViolation(order, refund);

    expect(violationDetectorSpy.recordViolation).toHaveBeenCalledTimes(1);
    const [code, context] = violationDetectorSpy.recordViolation.mock.calls[0];
    expect(code).toBe('REFUND_5_PER_QUARTER');
    expect(context.vendorId).toBe(1);
    expect(context.orderId).toBe(100);
    expect(context.refundId).toBe(50);
    // [POIN 6] verify evidence SYSTEM_GENERATED
    expect(context.evidence).toBeDefined();
    expect(context.evidence.provenance).toBe('SYSTEM_GENERATED');
    expect(context.evidence.snapshot.refundId).toBe(50);
    expect(context.evidence.snapshot.refundCount).toBe(5);
    expect(context.evidence.snapshot.thresholdHit).toBe('5');
    expect(context.evidence.snapshot.triggeredAt).toBeDefined();
  });

  it('REFUND_6_10_PER_QUARTER → snapshot berisi thresholdRange: 6-10', async () => {
    violationDetectorSpy.countVendorRefundsInQuarter.mockResolvedValue(7);

    const order = { id: 200, vendor_id: 2, project_number: 'PRJ-002' };
    const refund = { id: 75 };

    await (service as unknown as {
      checkRefundViolation: (o: any, r: any) => Promise<void>;
    }).checkRefundViolation(order, refund);

    expect(violationDetectorSpy.recordViolation).toHaveBeenCalledTimes(1);
    const [code, context] = violationDetectorSpy.recordViolation.mock.calls[0];
    expect(code).toBe('REFUND_6_10_PER_QUARTER');
    expect(context.evidence.provenance).toBe('SYSTEM_GENERATED');
    expect(context.evidence.snapshot.refundCount).toBe(7);
    expect(context.evidence.snapshot.thresholdRange).toBe('6-10');
  });
});