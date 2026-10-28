/* eslint-disable prettier/prettier */
import { Test, TestingModule } from '@nestjs/testing';
import { VendorViolationRevisionService } from './vendor-violation-revision.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrismaService = {
  vendor: { findFirst: jest.fn(), update: jest.fn() },
  vendor_sp: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  vendor_violation_log: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  vendor_violation_revision_request: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  vendor_sp_detail: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  vendor_violation_type: {
    findMany: jest.fn(),
  },
  users: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('VendorViolationRevisionService — syncVendorSpAfterPointChange', () => {
  let service: VendorViolationRevisionService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) => cb(mockPrismaService),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorViolationRevisionService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();
    service = module.get<VendorViolationRevisionService>(
      VendorViolationRevisionService,
    );
    prisma = module.get<PrismaService>(
      PrismaService,
    ) as unknown as typeof mockPrismaService;
  });

  const callSync = (
    serviceInstance: VendorViolationRevisionService,
    vendorId: number,
    userId: number,
  ) =>
    (
      serviceInstance as unknown as {
        syncVendorSpAfterPointChange: (
          tx: unknown,
          vendorId: number,
          userId: number,
        ) => Promise<void>;
      }
    ).syncVendorSpAfterPointChange(mockPrismaService, vendorId, userId);

  describe('existing SP branch', () => {
    it('updates existing SP and syncs vendor_sp_detail when totalPoints >= SP1', async () => {
      const existingSp = {
        id: 500,
        vendor_id: 42,
        sp_level: 1,
        status: 1,
        total_point: 25,
        quarter: 1,
        year: 2026,
      };
      jest
        .spyOn(
          service as unknown as {
            calculateTotalPoints: (
              tx: unknown,
              v: number,
              q: number,
              y: number,
            ) => Promise<number>;
          },
          'calculateTotalPoints',
        )
        .mockResolvedValue(10);
      jest
        .spyOn(
          service as unknown as {
            getCurrentQuarterYear: () => { quarter: number; year: number };
          },
          'getCurrentQuarterYear',
        )
        .mockReturnValue({ quarter: 1, year: 2026 });
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValueOnce(existingSp);
      (prisma.vendor_sp.update as jest.Mock).mockResolvedValueOnce({
        ...existingSp,
        total_point: 10,
      });
      (prisma.vendor_sp_detail.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 101 },
        { id: 102 },
      ]);
      (prisma.vendor_sp_detail.createMany as jest.Mock).mockResolvedValueOnce({
        count: 2,
      });
      (prisma.vendor.update as jest.Mock).mockResolvedValueOnce({ id: 42 });

      await callSync(service, 42, 7);

      expect(prisma.vendor_sp.update).toHaveBeenCalledTimes(1);
      expect(prisma.vendor_sp_detail.createMany).toHaveBeenCalledTimes(1);
      const createArgs = (prisma.vendor_sp_detail.createMany as jest.Mock).mock
        .calls[0][0];
      expect(createArgs.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            vendor_sp_id: 500,
            violation_log_id: 101,
            created_by: 7,
          }),
          expect.objectContaining({
            vendor_sp_id: 500,
            violation_log_id: 102,
            created_by: 7,
          }),
        ]),
      );
      expect(prisma.vendor_sp.create).not.toHaveBeenCalled();
    });

    it('is idempotent — second call inserts 0 new detail rows', async () => {
      const existingSp = {
        id: 600,
        vendor_id: 42,
        sp_level: 1,
        status: 1,
      };
      jest
        .spyOn(
          service as unknown as {
            calculateTotalPoints: (
              tx: unknown,
              v: number,
              q: number,
              y: number,
            ) => Promise<number>;
          },
          'calculateTotalPoints',
        )
        .mockResolvedValue(10);
      jest
        .spyOn(
          service as unknown as {
            getCurrentQuarterYear: () => { quarter: number; year: number };
          },
          'getCurrentQuarterYear',
        )
        .mockReturnValue({ quarter: 1, year: 2026 });
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValueOnce(existingSp);
      (prisma.vendor_sp.update as jest.Mock).mockResolvedValueOnce({
        ...existingSp,
        total_point: 10,
      });
      (prisma.vendor_sp_detail.findMany as jest.Mock).mockResolvedValueOnce([
        { violation_log_id: 101 },
        { violation_log_id: 102 },
      ]);
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 101 },
        { id: 102 },
      ]);

      await callSync(service, 42, 7);

      expect(prisma.vendor_sp_detail.createMany).not.toHaveBeenCalled();
    });
  });

  describe('new SP branch', () => {
    it('creates new SP and links violation logs', async () => {
      jest
        .spyOn(
          service as unknown as {
            calculateTotalPoints: (
              tx: unknown,
              v: number,
              q: number,
              y: number,
            ) => Promise<number>;
          },
          'calculateTotalPoints',
        )
        .mockResolvedValue(35);
      jest
        .spyOn(
          service as unknown as {
            getCurrentQuarterYear: () => { quarter: number; year: number };
          },
          'getCurrentQuarterYear',
        )
        .mockReturnValue({ quarter: 1, year: 2026 });
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValueOnce(null);
      const createdSp = {
        id: 9999,
        vendor_id: 42,
        sp_level: 2,
        status: 1,
        total_point: 35,
        quarter: 1,
        year: 2026,
      };
      (prisma.vendor_sp.create as jest.Mock).mockResolvedValueOnce(createdSp);
      (prisma.vendor_sp_detail.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 201 },
        { id: 202 },
        { id: 203 },
      ]);
      (prisma.vendor_sp_detail.createMany as jest.Mock).mockResolvedValueOnce({
        count: 3,
      });
      (prisma.vendor.update as jest.Mock).mockResolvedValueOnce({ id: 42 });

      await callSync(service, 42, 99);

      expect(prisma.vendor_sp.create).toHaveBeenCalledTimes(1);
      expect(prisma.vendor_sp_detail.createMany).toHaveBeenCalledTimes(1);
      const createArgs = (prisma.vendor_sp_detail.createMany as jest.Mock).mock
        .calls[0][0];
      expect(createArgs.data).toHaveLength(3);
      expect(createArgs.data.map((d: { violation_log_id: number }) => d.violation_log_id))
        .toEqual([201, 202, 203]);
    });
  });

  describe('below threshold', () => {
    it('marks SP SELESAI when totalPoints drops below SP1 and does not link details', async () => {
      const existingSp = {
        id: 700,
        vendor_id: 42,
        sp_level: 2,
        status: 1,
        notes: 'old notes',
      };
      jest
        .spyOn(
          service as unknown as {
            calculateTotalPoints: (
              tx: unknown,
              v: number,
              q: number,
              y: number,
            ) => Promise<number>;
          },
          'calculateTotalPoints',
        )
        .mockResolvedValue(0);
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValueOnce(existingSp);
      (prisma.vendor_sp.update as jest.Mock).mockResolvedValueOnce({
        ...existingSp,
        status: 2,
      });
      (prisma.vendor.update as jest.Mock).mockResolvedValueOnce({ id: 42, is_active: true });

      await callSync(service, 42, 7);

      expect(prisma.vendor_sp.update).toHaveBeenCalledTimes(1);
      expect(prisma.vendor_sp_detail.createMany).not.toHaveBeenCalled();
      expect(prisma.vendor.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { is_active: true },
      });
    });
  });

  describe('rebuildYear', () => {
    const user = { id: 99 } as any;
    const dto = {
      year: 2026,
      violation_codes: ['ORDER_NOT_CONFIRMED_H1'],
      dry_run: true,
    };

    beforeEach(() => {
      prisma.users.findFirst.mockResolvedValue({ roles: { name: 'Super User' } });
      prisma.vendor_violation_type.findMany.mockResolvedValue([
        { id: 1, code: 'ORDER_NOT_CONFIRMED_H1', point: 1 },
      ]);
      prisma.vendor_violation_log.findMany.mockResolvedValue([
        {
          id: 10,
          vendor_id: 42,
          violation_type_id: 1,
          order_id: null,
          quarter: 4,
          created_at: new Date('2026-10-01T00:00:00.000Z'),
          description: 'test violation',
          evidence_path: null,
          evidence_provenance: 'SYSTEM_GENERATED',
          created_by: null,
          adjusted_point: 1,
          violation_type: { code: 'ORDER_NOT_CONFIRMED_H1', point: 1 },
          vendor: { id: 42, company_name: 'Vendor 42' },
        },
        {
          id: 11,
          vendor_id: 42,
          violation_type_id: 2,
          order_id: null,
          quarter: 4,
          created_at: new Date('2026-10-02T00:00:00.000Z'),
          description: 'test violation 2',
          evidence_path: null,
          evidence_provenance: 'SYSTEM_GENERATED',
          created_by: null,
          adjusted_point: 1,
          violation_type: { code: 'DOC_NOT_UPLOADED', point: 1 },
          vendor: { id: 42, company_name: 'Vendor 42' },
        },
      ]);
    });

    it('returns a preview without writing data by default', async () => {
      const result = await service.rebuildYear(dto as any, user);

      expect(result).toEqual(expect.objectContaining({
        dryRun: true,
        violationLogCount: 2,
        selectedViolationLogCount: 1,
        rebuiltPointTotal: 1,
      }));
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.vendor_sp.create).not.toHaveBeenCalled();
    });

    it('requires explicit confirmation before applying the rebuild', async () => {
      await expect(
        service.rebuildYear({ ...dto, dry_run: false, delete_existing: true } as any, user),
      ).rejects.toThrow('DELETE_ALL_AND_REBUILD_VENDOR_SP_FROM_JULY_2026');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('resets 2026 rows and creates SP from selected violation types', async () => {
      prisma.vendor_sp.create.mockResolvedValue({ id: 700, sp_level: 1 });
      prisma.vendor_violation_log.create.mockResolvedValue({ id: 1001 });

      const result = await service.rebuildYear(
        {
          ...dto,
          dry_run: false,
          from_month: 7,
          delete_existing: true,
          delete_all: true,
          confirmation: 'DELETE_ALL_AND_REBUILD_VENDOR_SP_FROM_JULY_2026',
        } as any,
        user,
      );

      expect(prisma.vendor_violation_revision_request.updateMany).toHaveBeenCalledWith({
        where: { target_log_id: { not: null } },
        data: { target_log_id: null, updated_at: expect.any(Date) },
      });
      expect(prisma.vendor_sp_detail.deleteMany).toHaveBeenCalledWith({ where: {} });
      expect(prisma.vendor_sp.deleteMany).toHaveBeenCalledWith({ where: {} });
      expect(prisma.vendor_violation_log.deleteMany).toHaveBeenCalledWith({ where: {} });
      expect(prisma.vendor_violation_log.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          vendor_id: 42,
          violation_type_id: 1,
          order_id: null,
          quarter: 4,
          year: 2026,
          adjusted_point: null,
          is_active: true,
        }),
        select: { id: true },
      }));
      expect(prisma.vendor_sp.create).toHaveBeenCalledTimes(1);
      expect(prisma.vendor_sp_detail.createMany).toHaveBeenCalledWith({
        data: [{ vendor_sp_id: 700, violation_log_id: 1001, created_by: 99 }],
      });
      expect(result).toEqual(expect.objectContaining({
        dryRun: false,
        notificationsSent: 0,
        vendorStatusChanged: false,
      }));
    });
  });
});
