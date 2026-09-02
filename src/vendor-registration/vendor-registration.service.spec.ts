import { Test, TestingModule } from '@nestjs/testing';
import { VendorRegistrationService } from './vendor-registration.service';
import { PrismaService } from '../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bull';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RegistrationStatus } from './enums/registration-status.enum';

const mockPrismaService = {
  vendor_registration: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  vendor_registration_history: {
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  vendor_registration_token: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  vendor_terms_and_conditions: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  users: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  roles: {
    findFirst: jest.fn(),
  },
  vendor: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  pic_vendor: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (callback: any) => await callback(mockPrismaService)),
};

const mockEmailQueue = {
  add: jest.fn(),
};

// User mock dengan role "Admin HO" untuk melewati assertAdminHO
const mockAdminUser = {
  id: 99,
  deleted_at: null,
  roles: { name: 'Admin HO' },
};

// User mock dengan role "Pendaftar Vendor" untuk endpoint dashboard pendaftar
const mockRegistrantUser = {
  id: 50,
  deleted_at: null,
  roles: { name: 'Pendaftar Vendor' },
};

describe('VendorRegistrationService', () => {
  let service: VendorRegistrationService;
  let prisma: typeof mockPrismaService;
  let emailQueue: typeof mockEmailQueue;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorRegistrationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: getQueueToken('email'),
          useValue: mockEmailQueue,
        },
      ],
    }).compile();

    service = module.get<VendorRegistrationService>(VendorRegistrationService);
    prisma = module.get(PrismaService as any);
    emailQueue = module.get(getQueueToken('email'));

    jest.clearAllMocks();
  });

  describe('getRoleName()', () => {
    it('should return role name for existing user', async () => {
      prisma.users.findFirst.mockResolvedValue(mockAdminUser);
      const roleName = await service.getRoleName(99);
      expect(roleName).toBe('Admin HO');
    });

    it('should return null for missing user id', async () => {
      const roleName = await service.getRoleName(undefined);
      expect(roleName).toBeNull();
    });
  });

  describe('registerVendor()', () => {
    const validDto = {
      company_name: 'Test PT',
      email_address: 'test@pt.com',
      pic_name: 'PIC',
      pic_phone: '123',
      pic_email: 'pic@pt.com',
      phone_number: '123',
      address: 'Address',
      pdp_consent: true,
    };

    it('should create registration and registrant account successfully', async () => {
      prisma.vendor_registration.findFirst.mockResolvedValue(null);
      prisma.vendor.findFirst.mockResolvedValue(null);
      prisma.users.findFirst.mockResolvedValue(null);
      prisma.vendor_registration.create.mockResolvedValue({ id: 1, ...validDto });
      prisma.roles.findFirst.mockResolvedValue({ id: 10, name: 'Pendaftar Vendor' });
      prisma.users.create.mockResolvedValue({ id: 50, username: 'pic@pt.com' });
      prisma.vendor_registration.update.mockResolvedValue({ id: 1, user_id: 50 });
      prisma.vendor_registration_history.create.mockResolvedValue({ id: 1 });

      const result = await service.registerVendor(validDto as any);
      expect(result).toBeDefined();
      expect(result.registration_id).toBe(1);
      expect(prisma.vendor_registration.create).toHaveBeenCalled();
      // Akun pendaftar dibuat otomatis dengan role "Pendaftar Vendor"
      expect(prisma.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role_id: 10 }),
        }),
      );
      // Registrasi ter-link ke akun pendaftar
      expect(prisma.vendor_registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ user_id: 50 }),
        }),
      );
    });

    it('should handle duplicate email gracefully', async () => {
      prisma.vendor_registration.findFirst.mockResolvedValue({ id: 1, status: 1 });

      await expect(service.registerVendor(validDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate PIC email while registration in progress', async () => {
      prisma.vendor_registration.findFirst
        .mockResolvedValueOnce(null) // email perusahaan belum terdaftar
        .mockResolvedValueOnce({ id: 5, status: 1 }); // PIC email terpakai pendaftaran lain

      await expect(service.registerVendor(validDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should reject registration without pdp consent', async () => {
      await expect(
        service.registerVendor({ ...validDto, pdp_consent: false } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('terms and conditions', () => {
    it('getActiveTermsAndConditions() should return active terms', async () => {
      prisma.vendor_terms_and_conditions.findFirst.mockResolvedValue({
        id: 1,
        title: 'Syarat dan Ketentuan',
        content: '<p>Test</p>',
        version: 1,
        is_active: true,
        created_at: new Date(),
        updated_at: null,
      });

      const result = await service.getActiveTermsAndConditions();
      expect(result.title).toBe('Syarat dan Ketentuan');
      expect(result.content).toBe('<p>Test</p>');
    });

    it('getActiveTermsAndConditions() should throw when no active terms', async () => {
      prisma.vendor_terms_and_conditions.findFirst.mockResolvedValue(null);
      await expect(service.getActiveTermsAndConditions()).rejects.toThrow(NotFoundException);
    });

    it('updateTermsAndConditions() should create new version (Admin HO only)', async () => {
      prisma.users.findFirst.mockResolvedValue(mockAdminUser);
      prisma.vendor_terms_and_conditions.findFirst.mockResolvedValue({
        id: 1,
        title: 'Old',
        content: 'Old content',
        version: 1,
        is_active: true,
      });
      prisma.vendor_terms_and_conditions.update.mockResolvedValue({ id: 1 });
      prisma.vendor_terms_and_conditions.create.mockResolvedValue({
        id: 2,
        version: 2,
      });

      const result = await service.updateTermsAndConditions(
        { content: '<p>New content</p>' } as any,
        99,
      );
      expect(result.version).toBe(2);
      expect(prisma.vendor_terms_and_conditions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 2, is_active: true }),
        }),
      );
    });

    it('updateTermsAndConditions() should reject non-admin user', async () => {
      prisma.users.findFirst.mockResolvedValue(mockRegistrantUser);
      await expect(
        service.updateTermsAndConditions({ content: 'x' } as any, 50),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('registrant dashboard', () => {
    it('findMyRegistrations() should only return own registrations', async () => {
      prisma.users.findFirst.mockResolvedValue(mockRegistrantUser);
      prisma.vendor_registration.findMany.mockResolvedValue([
        {
          id: 1,
          company_name: 'Test PT',
          pic_name: 'PIC',
          pic_email: 'pic@pt.com',
          pic_phone: '123',
          status: RegistrationStatus.MENUNGGU_APPROVE,
          rejection_reason: null,
          created_at: new Date(),
          updated_at: null,
        },
      ]);

      const result = await service.findMyRegistrations(50);
      expect(result.total).toBe(1);
      expect(result.data[0].company_name).toBe('Test PT');
      // Ownership filter via user_id
      expect(prisma.vendor_registration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user_id: 50 }),
        }),
      );
    });

    it('findMyRegistrations() should reject non-registrant user', async () => {
      prisma.users.findFirst.mockResolvedValue(mockAdminUser);
      await expect(service.findMyRegistrations(99)).rejects.toThrow(ForbiddenException);
    });

    it('getRegistrantHomeContent() should return static content', () => {
      const content = service.getRegistrantHomeContent();
      expect(content.title).toBe('Bergabung & Tumbuh Bersama Mitra10');
      expect(content.benefits).toHaveLength(6);
    });
  });

  describe('approveRegistration()', () => {
    it('should throw NotFoundException when registration not found', async () => {
      prisma.users.findFirst.mockResolvedValue(mockAdminUser);
      prisma.vendor_registration.findFirst.mockResolvedValue(null);
      prisma.vendor_registration.findUnique.mockResolvedValue(null);

      await expect(
        service.approveRegistration(999, {} as any, 99),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when already approved', async () => {
      prisma.users.findFirst.mockResolvedValue(mockAdminUser);
      prisma.vendor_registration.findFirst.mockResolvedValue({ id: 1, status: 3 });

      await expect(service.approveRegistration(1, {} as any, 99)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('rejectRegistration()', () => {
    it('should reject registration with reason', async () => {
      prisma.users.findFirst.mockResolvedValue(mockAdminUser);
      prisma.vendor_registration.findFirst.mockResolvedValue({
        id: 1,
        status: 1,
        email_address: 'test@pt.com',
        company_name: 'PT A',
      });

      await service.rejectRegistration(1, { rejection_reason: 'Bad doc' } as any, 99);

      expect(prisma.vendor_registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: RegistrationStatus.DITOLAK,
            rejection_reason: 'Bad doc',
          }),
        }),
      );
    });

    it('should throw NotFoundException when registration not found', async () => {
      prisma.users.findFirst.mockResolvedValue(mockAdminUser);
      prisma.vendor_registration.findFirst.mockResolvedValue(null);

      await expect(
        service.rejectRegistration(999, { rejection_reason: '' } as any, 99),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
