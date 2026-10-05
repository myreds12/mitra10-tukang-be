/* eslint-disable prettier/prettier */
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../notifications/notifications.service', () => ({
  NotificationsService: jest.fn(),
}));

import { ViolationDetectorService } from './violation-detector.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Mocked Prisma client. The interactive transaction is mocked to invoke
 * its callback with the same mock reference, mirroring the convention
 * already established in vendor-sp.service.spec.ts.
 */
const mockPrismaService = {
  vendor_sp: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  vendor: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  vendor_violation_log: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  vendor_violation_type: {
    findFirst: jest.fn(),
  },
  vendor_sp_detail: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    createMany: jest.fn(),
    count: jest.fn(),
  },
  users: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockNotificationsService = {
  create: jest.fn(),
};

describe('ViolationDetectorService — checkAndIssueSP', () => {
  let service: ViolationDetectorService;
  let prisma: typeof mockPrismaService;
  let notif: typeof mockNotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.VENDOR_SP_ENABLED = 'true';
    mockPrismaService.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback(mockPrismaService),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViolationDetectorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();
    service = module.get<ViolationDetectorService>(ViolationDetectorService);
    prisma = module.get<PrismaService>(
      PrismaService,
    ) as unknown as typeof mockPrismaService;
    notif = module.get<NotificationsService>(
      NotificationsService,
    ) as unknown as typeof mockNotificationsService;
  });

  afterEach(() => {
    delete process.env.VENDOR_SP_ENABLED;
  });

  // Helper to drive the private method
  const callCheckAndIssueSP = (
    serviceInstance: ViolationDetectorService,
    args: {
      vendorId: number;
      totalPoints: number;
      quarter: number;
      year: number;
      userId?: number;
    },
  ) =>
    (
      serviceInstance as unknown as {
        checkAndIssueSP: (
          v: number,
          t: number,
          q: number,
          y: number,
          u: number | undefined,
        ) => Promise<{ spId: number; spLevel: number } | undefined>;
      }
    ).checkAndIssueSP(
      args.vendorId,
      args.totalPoints,
      args.quarter,
      args.year,
      args.userId,
    );

  it('returns undefined when totalPoints is below SP1 threshold (no SP needed)', async () => {
    const result = await callCheckAndIssueSP(service, {
      vendorId: 1,
      totalPoints: 0,
      quarter: 1,
      year: 2026,
    });
    expect(result).toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('transaction rollback', () => {
    it('does NOT call sendSPNotification when transaction throws', async () => {
      mockPrismaService.$transaction.mockImplementationOnce(async () => {
        throw new Error('simulated rollback');
      });

      const spy = jest
        .spyOn(service as unknown as { sendSPNotification: jest.Mock },
          'sendSPNotification')
        .mockResolvedValue(undefined);

      await expect(
        callCheckAndIssueSP(service, {
          vendorId: 42,
          totalPoints: 60,
          quarter: 1,
          year: 2026,
        }),
      ).rejects.toThrow('simulated rollback');

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('successful new SP3 issuance', () => {
    it('creates vendor_sp + links details, deactivates vendor, then sends notification', async () => {
      // No existing SP
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValueOnce(null);

      // vendor_sp.create returns a fresh SP3
      const createdSP = {
        id: 1234,
        vendor_id: 42,
        sp_level: 3,
        total_point: 60,
        quarter: 1,
        year: 2026,
        status: 1,
      };
      (prisma.vendor_sp.create as jest.Mock).mockResolvedValueOnce(createdSP);

      // sync helper internals
      (prisma.vendor_sp_detail.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 101 },
        { id: 102 },
      ]);
      (prisma.vendor_sp_detail.createMany as jest.Mock).mockResolvedValueOnce({
        count: 2,
      });
      // Deactivate vendor on SP3
      (prisma.vendor.update as jest.Mock).mockResolvedValueOnce({
        id: 42,
        is_active: false,
      });

      const spy = jest
        .spyOn(service as unknown as { sendSPNotification: jest.Mock },
          'sendSPNotification')
        .mockResolvedValue(undefined);

      const result = await callCheckAndIssueSP(service, {
        vendorId: 42,
        totalPoints: 60,
        quarter: 1,
        year: 2026,
        userId: 7,
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.vendor_sp.create).toHaveBeenCalledTimes(1);
      expect(prisma.vendor_sp_detail.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.vendor.update).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(42, 3, 60);
      expect(result).toEqual({ spId: 1234, spLevel: 3 });
    });

    it('does NOT send notification when newly issued is SP1/SP2', async () => {
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValueOnce(null);
      const createdSP = {
        id: 2000,
        vendor_id: 42,
        sp_level: 2,
        total_point: 30,
        quarter: 1,
        year: 2026,
        status: 1,
      };
      (prisma.vendor_sp.create as jest.Mock).mockResolvedValueOnce(createdSP);
      (prisma.vendor_sp_detail.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 999 },
      ]);
      (prisma.vendor_sp_detail.createMany as jest.Mock).mockResolvedValueOnce({
        count: 1,
      });

      const spy = jest
        .spyOn(service as unknown as { sendSPNotification: jest.Mock },
          'sendSPNotification')
        .mockResolvedValue(undefined);

      const result = await callCheckAndIssueSP(service, {
        vendorId: 42,
        totalPoints: 30,
        quarter: 1,
        year: 2026,
      });

      expect(result).toEqual({ spId: 2000, spLevel: 2 });
      expect(spy).not.toHaveBeenCalled();
    });

    it('does NOT send notification when existing SP is updated (not new)', async () => {
      const existingSP = {
        id: 900,
        vendor_id: 42,
        sp_level: 3,
        status: 1,
        quarter: 1,
        year: 2026,
      };
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValueOnce(existingSP);
      (prisma.vendor_sp.update as jest.Mock).mockResolvedValueOnce({
        ...existingSP,
        total_point: 60,
      });
      (prisma.vendor_sp_detail.findMany as jest.Mock).mockResolvedValueOnce([
        { violation_log_id: 101 },
      ]);
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 101 },
        { id: 102 },
      ]);
      (prisma.vendor_sp_detail.createMany as jest.Mock).mockResolvedValueOnce({
        count: 1,
      });

      const spy = jest
        .spyOn(service as unknown as { sendSPNotification: jest.Mock },
          'sendSPNotification')
        .mockResolvedValue(undefined);

      const result = await callCheckAndIssueSP(service, {
        vendorId: 42,
        totalPoints: 60,
        quarter: 1,
        year: 2026,
      });

      expect(result).toEqual({ spId: 900, spLevel: 3 });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('notification failure handling', () => {
    it('does NOT throw to caller when sendSPNotification fails after successful SP3 issuance', async () => {
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.vendor_sp.create as jest.Mock).mockResolvedValueOnce({
        id: 7777,
        vendor_id: 42,
        sp_level: 3,
        total_point: 60,
        status: 1,
        quarter: 1,
        year: 2026,
      });
      (prisma.vendor_sp_detail.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 555 },
      ]);
      (prisma.vendor_sp_detail.createMany as jest.Mock).mockResolvedValueOnce({
        count: 1,
      });
      (prisma.vendor.update as jest.Mock).mockResolvedValueOnce({ id: 42 });

      const spy = jest
        .spyOn(service as unknown as { sendSPNotification: jest.Mock },
          'sendSPNotification')
        .mockRejectedValue(new Error('notification service down'));

      const result = await callCheckAndIssueSP(service, {
        vendorId: 42,
        totalPoints: 60,
        quarter: 1,
        year: 2026,
      });

      expect(result).toEqual({ spId: 7777, spLevel: 3 });
      expect(spy).toHaveBeenCalledWith(42, 3, 60);
    });
  });

  // ================================
  // [POIN 6] Evidence requirement tests
  // ================================
  describe('recordViolation — POIN 6 evidence requirement', () => {
    /**
     * Helper: siapkan mock default sukses untuk recordViolation happy path,
     * supaya tiap test cukup override field yang relevan.
     */
    const setupHappyPath = () => {
      // VENDOR_SP_ENABLED diset via env di beforeEach (lihat constructor service)
      (prisma.vendor_violation_type.findFirst as jest.Mock).mockResolvedValue({
        id: 5,
        code: 'REFUND_5_PER_QUARTER',
        name: '5 refund per quarter',
        point: 1,
        category: 'REFUND',
        is_active: true,
        deleted_at: null,
      });
      (prisma.vendor_violation_log.findFirst as jest.Mock).mockResolvedValue(null); // no duplicate
      (prisma.vendor_violation_log.create as jest.Mock).mockResolvedValue({
        id: 9999,
        vendor_id: 7,
        violation_type_id: 5,
      });
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValue([]); // no extra violations
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValue(null);
    };

    it('tanpa evidence (undefined) → throw BadRequestException (Lapis 2 guard)', async () => {
      await expect(
        service.recordViolation('REFUND_5_PER_QUARTER', {
          vendorId: 7,
          // evidence sengaja tidak di-set
        } as any),
      ).rejects.toThrow(/Evidence wajib diisi/);
      expect(prisma.vendor_violation_log.create).not.toHaveBeenCalled();
    });

    it('evidence MANUAL_UPLOAD tanpa path → throw', async () => {
      await expect(
        service.recordViolation('REFUND_5_PER_QUARTER', {
          vendorId: 7,
          evidence: { provenance: 'MANUAL_UPLOAD' } as any,
        }),
      ).rejects.toThrow(/MANUAL_UPLOAD wajib menyertakan path/);
    });

    it('evidence SYSTEM_GENERATED dengan snapshot non-empty → success, provenance tercatat', async () => {
      setupHappyPath();

      const result = await service.recordViolation('REFUND_5_PER_QUARTER', {
        vendorId: 7,
        orderId: 100,
        description: 'test',
        evidence: {
          provenance: 'SYSTEM_GENERATED',
          snapshot: {
            refundId: 50,
            refundCount: 5,
            quarter: 1,
            year: 2026,
            triggeredAt: new Date().toISOString(),
          },
        },
      });

      expect(result.success).toBe(true);
      expect(prisma.vendor_violation_log.create).toHaveBeenCalledTimes(1);
      const createArgs = (prisma.vendor_violation_log.create as jest.Mock).mock
        .calls[0][0];
      // provenance disimpan ke kolom evidence_provenance
      expect(createArgs.data.evidence_provenance).toBe('SYSTEM_GENERATED');
      // evidence_path berisi JSON snapshot
      expect(createArgs.data.evidence_path).toMatch(/^\{.*"refundId":50/);
    });

    it('evidence MANUAL_UPLOAD dengan path valid → success, path langsung disimpan', async () => {
      setupHappyPath();

      const result = await service.recordViolation('CUSTOMER_COMPLAINT', {
        vendorId: 7,
        orderId: 100,
        description: 'test manual',
        evidence: {
          provenance: 'MANUAL_UPLOAD',
          path: '/uploads/evidence/refund-foto-12345.png',
        },
      });

      expect(result.success).toBe(true);
      const createArgs = (prisma.vendor_violation_log.create as jest.Mock).mock
        .calls[0][0];
      expect(createArgs.data.evidence_provenance).toBe('MANUAL_UPLOAD');
      expect(createArgs.data.evidence_path).toBe(
        '/uploads/evidence/refund-foto-12345.png',
      );
    });
  });

  describe('recordViolation & escalateViolation — Opsi B Escalation', () => {
    const typeH = {
      id: 1,
      code: 'ORDER_NOT_CONFIRMED_H',
      name: 'Orderan tidak terkonfirmasi pada Hari H',
      point: 1,
      category: 'KONFIRMASI_ORDER',
      is_active: true,
      deleted_at: null,
    };
    const typeH1 = {
      id: 2,
      code: 'ORDER_NOT_CONFIRMED_H1',
      name: 'Orderan tidak terkonfirmasi pada H+1',
      point: 1,
      category: 'KONFIRMASI_ORDER',
      is_active: true,
      deleted_at: null,
    };
    const typeHPlus = {
      id: 3,
      code: 'ORDER_NOT_CONFIRMED_H_PLUS',
      name: 'Orderan tidak terkonfirmasi pada >H+1',
      point: 1,
      category: 'KONFIRMASI_ORDER',
      is_active: true,
      deleted_at: null,
    };
    const typeLateH2 = {
      id: 10,
      code: 'QUOTATION_LATE_H2',
      name: 'Quotation terbit > H+2 sejak Survey Selesai',
      point: 1,
      category: 'LAINNYA',
      is_active: true,
      deleted_at: null,
    };
    const typeLateH3 = {
      id: 11,
      code: 'QUOTATION_LATE_H3',
      name: 'Quotation terbit > H+3 sejak Survey Selesai',
      point: 1,
      category: 'LAINNYA',
      is_active: true,
      deleted_at: null,
    };

    beforeEach(() => {
      (prisma.vendor_violation_type.findFirst as jest.Mock).mockImplementation(
        ({ where }: any) => {
          if (where.code === 'ORDER_NOT_CONFIRMED_H') return Promise.resolve(typeH);
          if (where.code === 'ORDER_NOT_CONFIRMED_H1') return Promise.resolve(typeH1);
          if (where.code === 'ORDER_NOT_CONFIRMED_H_PLUS') return Promise.resolve(typeHPlus);
          if (where.code === 'QUOTATION_LATE_H2') return Promise.resolve(typeLateH2);
          if (where.code === 'QUOTATION_LATE_H3') return Promise.resolve(typeLateH3);
          return Promise.resolve(null);
        },
      );
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValue([]);
    });

    it('ORDER_NOT_CONFIRMED_H baru (tanpa prior log) → insert baris baru', async () => {
      (prisma.vendor_violation_log.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.vendor_violation_log.create as jest.Mock).mockResolvedValue({
        id: 101,
        vendor_id: 15,
        violation_type_id: typeH.id,
      });

      const res = await service.recordViolation('ORDER_NOT_CONFIRMED_H', {
        vendorId: 15,
        orderId: 200,
        description: 'Order belum dikonfirmasi Hari H',
        evidence: {
          provenance: 'SYSTEM_GENERATED',
          snapshot: { orderId: 200, daysSinceAssigned: 1 },
        },
      });

      expect(res.success).toBe(true);
      expect(prisma.vendor_violation_log.create).toHaveBeenCalledTimes(1);
      expect(prisma.vendor_violation_log.update).not.toHaveBeenCalled();
    });

    it('Eskalasi H ke H+1: meng-update log existing, pointAdded 0, snapshot escalated_from tercatat', async () => {
      const existingHLog = {
        id: 101,
        vendor_id: 15,
        order_id: 200,
        violation_type_id: typeH.id,
        violation_type: typeH,
        evidence_path: JSON.stringify({ orderId: 200, daysSinceAssigned: 1 }),
        evidence_provenance: 'SYSTEM_GENERATED',
      };
      (prisma.vendor_violation_log.findFirst as jest.Mock).mockResolvedValue(existingHLog);
      (prisma.vendor_violation_log.update as jest.Mock).mockResolvedValue({
        ...existingHLog,
        violation_type_id: typeH1.id,
      });

      const res = await service.recordViolation('ORDER_NOT_CONFIRMED_H1', {
        vendorId: 15,
        orderId: 200,
        description: 'Order belum dikonfirmasi H+1',
        evidence: {
          provenance: 'SYSTEM_GENERATED',
          snapshot: { orderId: 200, daysSinceAssigned: 2 },
        },
      });

      expect(res.success).toBe(true);
      expect(res.violationLogId).toBe(101);
      expect(res.pointAdded).toBe(0);
      expect(prisma.vendor_violation_log.create).not.toHaveBeenCalled();
      expect(prisma.vendor_violation_log.update).toHaveBeenCalledTimes(1);

      const updateArgs = (prisma.vendor_violation_log.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.where.id).toBe(101);
      expect(updateArgs.data.violation_type_id).toBe(typeH1.id);
      const parsedEvidence = JSON.parse(updateArgs.data.evidence_path);
      expect(parsedEvidence.escalated_from).toBe('ORDER_NOT_CONFIRMED_H');
      expect(parsedEvidence.escalated_at).toBeDefined();
    });

    it('Tier sama dipanggil ulang (H1 lagi) → ditolak sebagai duplicate (success: false, tanpa insert/update)', async () => {
      const existingH1Log = {
        id: 101,
        vendor_id: 15,
        order_id: 200,
        violation_type_id: typeH1.id,
        violation_type: typeH1,
      };
      (prisma.vendor_violation_log.findFirst as jest.Mock).mockResolvedValue(existingH1Log);

      const res = await service.recordViolation('ORDER_NOT_CONFIRMED_H1', {
        vendorId: 15,
        orderId: 200,
        description: 'Order belum dikonfirmasi H+1',
        evidence: {
          provenance: 'SYSTEM_GENERATED',
          snapshot: { orderId: 200, daysSinceAssigned: 2 },
        },
      });

      expect(res.success).toBe(false);
      expect(res.message).toMatch(/sudah pernah dicatat atau dieskalasi/);
      expect(prisma.vendor_violation_log.create).not.toHaveBeenCalled();
      expect(prisma.vendor_violation_log.update).not.toHaveBeenCalled();
    });

    it('Tier lebih rendah dipanggil setelah tier lebih tinggi (H setelah H1) → diabaikan (success: false)', async () => {
      const existingH1Log = {
        id: 101,
        vendor_id: 15,
        order_id: 200,
        violation_type_id: typeH1.id,
        violation_type: typeH1,
      };
      (prisma.vendor_violation_log.findFirst as jest.Mock).mockResolvedValue(existingH1Log);

      const res = await service.recordViolation('ORDER_NOT_CONFIRMED_H', {
        vendorId: 15,
        orderId: 200,
        description: 'Order telat Hari H',
        evidence: {
          provenance: 'SYSTEM_GENERATED',
          snapshot: { orderId: 200, daysSinceAssigned: 1 },
        },
      });

      expect(res.success).toBe(false);
      expect(prisma.vendor_violation_log.create).not.toHaveBeenCalled();
      expect(prisma.vendor_violation_log.update).not.toHaveBeenCalled();
    });

    it('Eskalasi Quotation: H2 ke H3 meng-update baris yang sama dengan metadata escalated_from QUOTATION_LATE_H2', async () => {
      const existingH2Log = {
        id: 205,
        vendor_id: 15,
        order_id: 300,
        violation_type_id: typeLateH2.id,
        violation_type: typeLateH2,
        evidence_path: JSON.stringify({ orderId: 300, daysSinceSurveyDone: 2 }),
        evidence_provenance: 'SYSTEM_GENERATED',
      };
      (prisma.vendor_violation_log.findFirst as jest.Mock).mockResolvedValue(existingH2Log);
      (prisma.vendor_violation_log.update as jest.Mock).mockResolvedValue({
        ...existingH2Log,
        violation_type_id: typeLateH3.id,
      });

      const res = await service.recordViolation('QUOTATION_LATE_H3', {
        vendorId: 15,
        orderId: 300,
        description: 'Quotation telat H+3',
        evidence: {
          provenance: 'SYSTEM_GENERATED',
          snapshot: { orderId: 300, daysSinceSurveyDone: 3 },
        },
      });

      expect(res.success).toBe(true);
      expect(res.violationLogId).toBe(205);
      expect(prisma.vendor_violation_log.create).not.toHaveBeenCalled();
      expect(prisma.vendor_violation_log.update).toHaveBeenCalledTimes(1);

      const updateArgs = (prisma.vendor_violation_log.update as jest.Mock).mock.calls[0][0];
      expect(updateArgs.data.violation_type_id).toBe(typeLateH3.id);
      const parsedEvidence = JSON.parse(updateArgs.data.evidence_path);
      expect(parsedEvidence.escalated_from).toBe('QUOTATION_LATE_H2');
    });

    it('Kasus Customer A (langsung H+3 tanpa riwayat H2 sebelumnya) → langsung insert QUOTATION_LATE_H3', async () => {
      (prisma.vendor_violation_log.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.vendor_violation_log.create as jest.Mock).mockResolvedValue({
        id: 301,
        vendor_id: 15,
        violation_type_id: typeLateH3.id,
      });

      const res = await service.recordViolation('QUOTATION_LATE_H3', {
        vendorId: 15,
        orderId: 400,
        description: 'Quotation belum dibuat > H+3',
        evidence: {
          provenance: 'SYSTEM_GENERATED',
          snapshot: { orderId: 400, daysSinceSurveyDone: 5 },
        },
      });

      expect(res.success).toBe(true);
      expect(prisma.vendor_violation_log.create).toHaveBeenCalledTimes(1);
      const createArgs = (prisma.vendor_violation_log.create as jest.Mock).mock.calls[0][0];
      expect(createArgs.data.violation_type_id).toBe(typeLateH3.id);
    });
  });
});

