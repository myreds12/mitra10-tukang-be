/* eslint-disable prettier/prettier */
import { Test, TestingModule } from '@nestjs/testing';
import { VendorViolationService } from './vendor-violation.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Mocked Prisma client that simulates the interactive transaction API by
 * calling the callback with the same mock reference. Tests can then assert
 * which mock methods were invoked and how.
 */
const mockPrismaService = {
  vendor_sp: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  vendor: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  vendor_violation_log: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  vendor_violation_type: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  vendor_reactivation_log: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  vendor_sp_detail: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    createMany: jest.fn(),
  },
  logs: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
    callback(mockPrismaService),
  ),
};

describe('VendorViolationService — issueSP & syncVendorSpDetails', () => {
  let service: VendorViolationService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorViolationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();
    service = module.get<VendorViolationService>(VendorViolationService);
    prisma = module.get<PrismaService>(PrismaService) as unknown as typeof mockPrismaService;
  });

  describe('issueSP — new SP path', () => {
    it('creates vendor_sp and links all candidate violation logs in one transaction', async () => {
      const candidateLogs = [{ id: 101 }, { id: 102 }, { id: 103 }];

      // 1) existingSP check: nothing found
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValueOnce(null);

      // 2) vendor_sp.create returns a fresh record
      const createdSP = {
        id: 555,
        vendor_id: 42,
        sp_level: 2,
        total_point: 30,
        quarter: 1,
        year: 2026,
        status: 1,
      };
      (prisma.vendor_sp.create as jest.Mock).mockResolvedValueOnce(createdSP);

      // 3) Inside sync helper: findMany of existing details (none yet)
      (prisma.vendor_sp_detail.findMany as jest.Mock).mockResolvedValueOnce([]);
      // 4) findMany of candidate logs
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce(
        candidateLogs,
      );
      // 5) createMany records
      (prisma.vendor_sp_detail.createMany as jest.Mock).mockResolvedValueOnce({
        count: 3,
      });

      // Call the private issueSP method via `as unknown` cast. This is
      // intentional: we are testing the production behaviour, not the
      // symbol accessibility.
      const result = await (
        service as unknown as {
          issueSP: (
            v: number,
            l: number,
            t: number,
            q: number,
            y: number,
            u: number | null,
          ) => Promise<typeof createdSP>;
        }
      ).issueSP(42, 2, 30, 1, 2026, 7);

      expect(result).toBe(createdSP);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.vendor_sp.create).toHaveBeenCalledTimes(1);
      expect(prisma.vendor_sp_detail.createMany).toHaveBeenCalledTimes(1);
      const createArgs = (prisma.vendor_sp_detail.createMany as jest.Mock).mock
        .calls[0][0];
      expect(createArgs.data).toHaveLength(3);
      expect(createArgs.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            vendor_sp_id: 555,
            violation_log_id: 101,
            created_by: 7,
          }),
          expect.objectContaining({
            vendor_sp_id: 555,
            violation_log_id: 102,
            created_by: 7,
          }),
          expect.objectContaining({
            vendor_sp_id: 555,
            violation_log_id: 103,
            created_by: 7,
          }),
        ]),
      );
    });
  });

  describe('issueSP — update existing SP path', () => {
    it('updates vendor_sp and re-syncs details (idempotent)', async () => {
      const existingSP = {
        id: 900,
        vendor_id: 42,
        sp_level: 1,
        status: 1,
        total_point: 25,
        quarter: 1,
        year: 2026,
      };

      // existingSP found
      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValueOnce(existingSP);

      // We pretend there are already 2 detail rows linked
      (prisma.vendor_sp_detail.findMany as jest.Mock).mockResolvedValueOnce([
        { violation_log_id: 101 },
        { violation_log_id: 102 },
      ]);

      // 3 more candidate logs (101 + 102 + new 103 + new 104 = 4 total,
      // only 2 of them are new)
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 101 },
        { id: 102 },
        { id: 103 },
        { id: 104 },
      ]);
      (prisma.vendor_sp_detail.createMany as jest.Mock).mockResolvedValueOnce({
        count: 2,
      });

      const result = await (
        service as unknown as {
          issueSP: (
            v: number,
            l: number,
            t: number,
            q: number,
            y: number,
            u: number | null,
          ) => Promise<{ id: number }>;
        }
      ).issueSP(42, 1, 26, 1, 2026, null);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.vendor_sp.update).toHaveBeenCalledTimes(1);
      // createMany should ONLY receive the new links, not duplicates.
      const createArgs = (prisma.vendor_sp_detail.createMany as jest.Mock).mock
        .calls[0][0];
      expect(createArgs.data).toHaveLength(2);
      expect(createArgs.data.map((d: { violation_log_id: number }) => d.violation_log_id)).toEqual([
        103, 104,
      ]);
    });

    it('is idempotent — second invocation inserts 0 rows', async () => {
      const existingSP = {
        id: 900,
        vendor_id: 42,
        sp_level: 1,
        status: 1,
        quarter: 1,
        year: 2026,
      };

      (prisma.vendor_sp.findFirst as jest.Mock).mockResolvedValueOnce(existingSP);
      // Already linked to ALL candidate logs
      (prisma.vendor_sp_detail.findMany as jest.Mock).mockResolvedValueOnce([
        { violation_log_id: 101 },
        { violation_log_id: 102 },
        { violation_log_id: 103 },
      ]);
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce([
        { id: 101 },
        { id: 102 },
        { id: 103 },
      ]);

      await (
        service as unknown as {
          issueSP: (
            v: number,
            l: number,
            t: number,
            q: number,
            y: number,
            u: number | null,
          ) => Promise<{ id: number }>;
        }
      ).issueSP(42, 1, 25, 1, 2026, 99);

      expect(prisma.vendor_sp_detail.createMany).not.toHaveBeenCalled();
    });
  });

  describe('exportViolationLogExcel', () => {
    type ExportMethod = (
      q: Record<string, unknown>,
      userId: number | null,
    ) => Promise<{ filePath: string; fileName: string; rowCount: number }>;
    const callExport = (q: Record<string, unknown>, userId: number | null) =>
      (service as unknown as { exportViolationLogExcel: ExportMethod })
        .exportViolationLogExcel(q, userId);

    beforeEach(() => {
      (prisma.vendor_sp.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.logs.create as jest.Mock).mockResolvedValue({ id: 999 });
    });

    it('throws BadRequestException when date_from > date_to', async () => {
      await expect(
        callExport({ date_from: '2026-03-01', date_to: '2026-01-01' }, 7),
      ).rejects.toThrow(/date_from tidak boleh lebih besar dari date_to/);

      expect(prisma.vendor_violation_log.count).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when total count exceeds 50000 rows', async () => {
      (
        prisma.vendor_violation_log.count as jest.Mock
      ).mockResolvedValueOnce(50001);

      await expect(
        callExport({ quarter: 1, year: 2026 }, 7),
      ).rejects.toThrow(/melebihi batas 50000/);

      expect(prisma.vendor_violation_log.findMany).not.toHaveBeenCalled();
    });

    it('writes 2-sheet workbook with expected headers and rows', async () => {
      const fixedRows = [
        {
          id: 1,
          created_at: new Date('2026-02-10T08:00:00Z'),
          vendor_id: 42,
          order_id: 100,
          quarter: 1,
          year: 2026,
          is_active: true,
          evidence_path: '/uploads/evidence/abc.png',
          description: 'sample',
          vendor: {
            id: 42,
            company_name: 'CV. Mitra Jaya',
            pic_name: 'Budi Santoso',
          },
          violation_type: {
            id: 5,
            code: 'ORDER_NOT_CONFIRMED_H',
            category: 'KONFIRMASI_ORDER',
            name: 'Order tidak terkonfirmasi pada Hari H',
            point: 1,
          },
          orders: { id: 100, project_number: 'SP_ORDER_TEST_001' },
          adjusted_point: null,
        },
        {
          id: 2,
          created_at: new Date('2026-02-11T08:00:00Z'),
          vendor_id: 42,
          order_id: null,
          quarter: 1,
          year: 2026,
          is_active: true,
          evidence_path: null,
          description: null,
          vendor: {
            id: 42,
            company_name: 'CV. Mitra Jaya',
            pic_name: 'Budi Santoso',
          },
          violation_type: {
            id: 6,
            code: 'REFUND_5_PER_QUARTER',
            category: 'REFUND',
            name: '5 order refund per quarter',
            point: 1,
          },
          orders: null,
          adjusted_point: null,
        },
      ];

      (prisma.vendor_violation_log.count as jest.Mock).mockResolvedValueOnce(2);
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce(
        fixedRows,
      );

      const result = await callExport({}, 7);

      expect(result.fileName).toMatch(/^log-pelanggaran-.+\.xlsx$/);
      expect(result.rowCount).toBe(2);

      const fs = require('fs');
      expect(fs.existsSync(result.filePath)).toBe(true);

      const exceljs = require('exceljs');
      const wb = new exceljs.Workbook();
      await wb.xlsx.readFile(result.filePath);

      expect(wb.worksheets).toHaveLength(2);
      expect(wb.getWorksheet('Log Pelanggaran')).toBeDefined();
      expect(wb.getWorksheet('Summary per Vendor')).toBeDefined();

      const logSheet = wb.getWorksheet('Log Pelanggaran')!;
      const logHeader = logSheet.getRow(1).values as string[];
      expect(logHeader).toEqual(
        expect.arrayContaining([
          'ID',
          'Tanggal',
          'Nama Vendor',
          'PIC',
          'Kategori',
          'Kode Pelanggaran',
          'Nama Pelanggaran',
          'Order ID',
          'Project Number',
          'Poin',
          'Quarter',
          'Year',
          'Status Aktif',
          'Evidence Path',
          'Ada Evidence',
          'Deskripsi',
        ]),
      );
      expect(logSheet.rowCount).toBe(3);

      const summarySheet = wb.getWorksheet('Summary per Vendor')!;
      const summaryHeader = summarySheet.getRow(1).values as string[];
      expect(summaryHeader).toEqual(
        expect.arrayContaining([
          'Nama Vendor',
          'Total Pelanggaran',
          'Total Poin',
          'SP Level Saat Ini',
          'Pelanggaran Tanpa Evidence',
        ]),
      );
      expect(summarySheet.rowCount).toBe(2);

      try {
        fs.unlinkSync(result.filePath);
      } catch {
        /* ignore cleanup errors */
      }
    });

    it('writes an audit log row with the user_id and filters after successful export', async () => {
      (prisma.vendor_violation_log.count as jest.Mock).mockResolvedValueOnce(0);
      (prisma.vendor_violation_log.findMany as jest.Mock).mockResolvedValueOnce(
        [],
      );

      const result = await callExport(
        { vendor_id: 42, quarter: 2, year: 2026 },
        99,
      );

      const logsCreate = prisma.logs.create as jest.Mock;
      expect(logsCreate).toHaveBeenCalledTimes(1);
      const auditArgs = logsCreate.mock.calls[0][0];
      expect(auditArgs.data.issuer_type).toBe('USER');
      expect(auditArgs.data.issuer_id).toBe(99);
      expect(auditArgs.data.module_type).toBe('EXPORT');
      const properties = JSON.parse(auditArgs.data.properties);
      expect(properties.endpoint).toBe('GET /vendor-violation/log/export');
      expect(properties.filters).toEqual({
        vendor_id: 42,
        quarter: 2,
        year: 2026,
        category: undefined,
        search: undefined,
        date_from: undefined,
        date_to: undefined,
      });
      expect(properties.row_count).toBe(0);
      expect(properties.file_name).toBe(result.fileName);

      try {
        const fs = require('fs');
        fs.unlinkSync(result.filePath);
      } catch {
        /* ignore cleanup errors */
      }
    });
  });
});
