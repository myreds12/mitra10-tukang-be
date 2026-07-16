import { Test, TestingModule } from '@nestjs/testing';
import { VendorSpService } from './vendor-sp.service';
// Path ke PrismaService mungkin bervariasi, disesuaikan dengan arsitektur umum NestJS
import { PrismaService } from '../prisma/prisma.service'; 
import { NotFoundException, BadRequestException } from '@nestjs/common';

// --- Mock Setup Template ---
const mockPrismaService = {
  vendor_sp: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  vendor: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  vendor_reactivation_log: {
    create: jest.fn(),
  },
  // Mock transaction agar langsung mengeksekusi callback dengan mockPrismaService
  $transaction: jest.fn(async (callback) => await callback(mockPrismaService)),
};

describe('VendorSpService', () => {
  let service: VendorSpService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorSpService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<VendorSpService>(VendorSpService);
    prisma = module.get(PrismaService as any);
    
    // Clear mocks sebelum setiap test
    jest.clearAllMocks();
  });

  describe('checkVendorSpStatus()', () => {
    it('should return has_active_sp: false when vendor has no SP', async () => {
      // Mock db response
      prisma.vendor_sp.findFirst.mockResolvedValue(null);

      const result = await service.checkVendorSpStatus(1);
      expect(result).toEqual({ has_active_sp: false, vendor_status: 'AKTIF' });
      expect(prisma.vendor_sp.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ vendor_id: 1 })
      }));
    });

    it('should return SP1 data when vendor has active SP1', async () => {
      const mockSp = { sp_level: 1, total_point: 30, status: 1 };
      prisma.vendor_sp.findFirst.mockResolvedValue(mockSp);

      const result = await service.checkVendorSpStatus(1);
      expect(result.has_active_sp).toBe(true);
      expect(result.sp_info?.sp_level).toBe(1);
      expect(result.sp_info?.sp_status).toBe('SP1');
      expect(result.vendor_status).toBe('AKTIF');
    });

    it('should return SP2 data when vendor has active SP2', async () => {
      const mockSp = { sp_level: 2, total_point: 40, status: 1 };
      prisma.vendor_sp.findFirst.mockResolvedValue(mockSp);

      const result = await service.checkVendorSpStatus(1);
      expect(result.has_active_sp).toBe(true);
      expect(result.sp_info?.sp_level).toBe(2);
      expect(result.sp_info?.sp_status).toBe('SP2');
      expect(result.vendor_status).toBe('AKTIF');
    });

    it('should return NONAKTIF when vendor has SP3', async () => {
      const mockSp = { sp_level: 3, total_point: 50, status: 1 };
      prisma.vendor_sp.findFirst.mockResolvedValue(mockSp);

      const result = await service.checkVendorSpStatus(1);
      expect(result.has_active_sp).toBe(true);
      expect(result.sp_info?.sp_level).toBe(3);
      expect(result.vendor_status).toBe('NONAKTIF');
    });

    it('should return expired SP correctly (has_active_sp: false)', async () => {
      // Return null simulasi jika tidak ada SP yang memenuhi `end_date >= now`
      prisma.vendor_sp.findFirst.mockResolvedValue(null);

      const result = await service.checkVendorSpStatus(1);
      expect(result.has_active_sp).toBe(false);
    });
  });

  describe('completeSp()', () => {
    it('should mark SP as completed successfully', async () => {
      const mockSp = { id: 1, status: 1, sp_level: 1 };
      prisma.vendor_sp.findFirst.mockResolvedValue(mockSp);
      prisma.vendor_sp.update.mockResolvedValue({ ...mockSp, status: 2 });

      const result = await service.completeSp(1, { notes: 'Done' }, 99);
      expect(prisma.vendor_sp.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 2, notes: 'Done' })
      }));
      expect(result.status).toBe(2);
    });

    it('should throw NotFoundException when SP not found', async () => {
      prisma.vendor_sp.findFirst.mockResolvedValue(null);
      await expect(service.completeSp(999, {}, 99)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when SP already completed', async () => {
      prisma.vendor_sp.findFirst.mockResolvedValue({ id: 1, status: 2 });
      await expect(service.completeSp(1, {}, 99)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when SP is inactive', async () => {
      prisma.vendor_sp.findFirst.mockResolvedValue({ id: 1, status: 0 }); // Inactive
      await expect(service.completeSp(1, {}, 99)).rejects.toThrow(BadRequestException);
    });
  });

  describe('reactivateVendor()', () => {
    const dto = { vendor_id: 1, previous_sp_id: 1, reason: 'Reactivation request' };

    it('should reactivate vendor successfully', async () => {
      const mockVendor = { id: 1, is_active: false };
      prisma.vendor.findFirst.mockResolvedValue(mockVendor);
      prisma.vendor_reactivation_log.create.mockResolvedValue({ id: 1 });
      prisma.vendor.update.mockResolvedValue({ ...mockVendor, is_active: true });

      const result = await service.reactivateVendor(dto, 99);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.vendor.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { is_active: true }
      }));
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException when vendor already active', async () => {
      prisma.vendor.findFirst.mockResolvedValue({ id: 1, is_active: true });
      await expect(service.reactivateVendor(dto, 99)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when vendor not found', async () => {
      prisma.vendor.findFirst.mockResolvedValue(null);
      await expect(service.reactivateVendor(dto, 99)).rejects.toThrow(NotFoundException);
    });

    it('should create reactivation log entry', async () => {
      const mockVendor = { id: 1, is_active: false };
      prisma.vendor.findFirst.mockResolvedValue(mockVendor);
      prisma.vendor_reactivation_log.create.mockResolvedValue({ id: 1 });
      
      await service.reactivateVendor(dto, 99);
      expect(prisma.vendor_reactivation_log.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ reason: 'Reactivation request', approved_by: 99 })
      }));
    });
  });

  describe('extendSpDuration()', () => {
    it('should extend SP end_date successfully', async () => {
      const mockSp = { id: 1, status: 1 };
      prisma.vendor_sp.findFirst.mockResolvedValue(mockSp);
      prisma.vendor_sp.update.mockResolvedValue({ ...mockSp, status: 3 }); // Extended

      const result = await service.extendSpDuration(1, { extension_days: 30, reason: 'Test' }, 99);
      expect(prisma.vendor_sp.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 3 })
      }));
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when SP not found', async () => {
      prisma.vendor_sp.findFirst.mockResolvedValue(null);
      await expect(service.extendSpDuration(999, { extension_days: 30, reason: 'Test' }, 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll()', () => {
    it('should return paginated results', async () => {
      prisma.vendor_sp.findMany.mockResolvedValue([{ id: 1 }]);
      prisma.vendor_sp.count = jest.fn().mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toBeDefined();
      expect(result.meta.page).toBe(1);
      expect(prisma.vendor_sp.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10, skip: 0 }));
    });

    it('should filter by sp_level correctly', async () => {
      prisma.vendor_sp.findMany.mockResolvedValue([]);
      prisma.vendor_sp.count = jest.fn().mockResolvedValue(0);

      await service.findAll({ sp_level: 2 });
      expect(prisma.vendor_sp.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ sp_level: 2 })
      }));
    });

    it('should filter by status correctly', async () => {
      prisma.vendor_sp.findMany.mockResolvedValue([]);
      prisma.vendor_sp.count = jest.fn().mockResolvedValue(0);

      await service.findAll({ status: 1 });
      expect(prisma.vendor_sp.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ status: 1 })
      }));
    });

    it('should filter by vendor_id correctly', async () => {
      prisma.vendor_sp.findMany.mockResolvedValue([]);
      prisma.vendor_sp.count = jest.fn().mockResolvedValue(0);

      await service.findAll({ vendor_id: 123 });
      expect(prisma.vendor_sp.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ vendor_id: 123 })
      }));
    });

    it('should include vendor relation in results', async () => {
      prisma.vendor_sp.findMany.mockResolvedValue([]);
      prisma.vendor_sp.count = jest.fn().mockResolvedValue(0);

      await service.findAll({});
      expect(prisma.vendor_sp.findMany).toHaveBeenCalledWith(expect.objectContaining({
        include: expect.objectContaining({ vendor: true })
      }));
    });
  });
});
