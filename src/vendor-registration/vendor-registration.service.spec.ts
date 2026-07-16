import { Test, TestingModule } from '@nestjs/testing';
import { VendorRegistrationService } from './vendor-registration.service';
import { PrismaService } from '../prisma/prisma.service'; 
import { getQueueToken } from '@nestjs/bull';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const mockPrismaService = {
  vendor_registration: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  vendor_registration_token: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  users: {
    findFirst: jest.fn(),
    create: jest.fn(),
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
  $transaction: jest.fn(async (callback) => await callback(mockPrismaService)),
};

const mockEmailQueue = {
  add: jest.fn(),
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

  describe('registerVendor()', () => {
    const validDto = {
      company_name: 'Test PT',
      email_address: 'test@pt.com',
      pic_name: 'PIC',
      pic_phone: '123',
      pic_email: 'pic@pt.com',
      phone_number: '123',
      address: 'Address'
    };

    it('should create registration successfully', async () => {
      prisma.vendor_registration.findFirst.mockResolvedValue(null);
      prisma.vendor_registration.create.mockResolvedValue({ id: 1, ...validDto });

      const result = await service.registerVendor(validDto as any);
      expect(result).toBeDefined();
      expect(prisma.vendor_registration.create).toHaveBeenCalled();
    });

    it('should handle duplicate email gracefully', async () => {
      // Simulate existing email (status 1 or 2)
      prisma.vendor_registration.findFirst.mockResolvedValue({ id: 1, status: 1 });

      await expect(service.registerVendor(validDto as any)).rejects.toThrow(BadRequestException);
    });

    // Generating unique token and sending email logic is in approveRegistration
    // (Assuming token is generated on approval per your implementation context)
  });

  describe('validateToken()', () => {
    it('should return valid for active token', async () => {
      const mockToken = { 
        status: 1, 
        expires_at: new Date(Date.now() + 100000),
        registration: { company_name: 'Test PT' } 
      };
      prisma.vendor_registration_token.findFirst.mockResolvedValue(mockToken);

      const result = await service.validateToken('valid-token');
      expect(result.valid).toBe(true);
      expect(result.company_name).toBe('Test PT');
    });

    it('should return invalid for expired token', async () => {
      const mockToken = { 
        status: 1, 
        expires_at: new Date(Date.now() - 100000) // Expired
      };
      prisma.vendor_registration_token.findFirst.mockResolvedValue(mockToken);

      await expect(service.validateToken('expired-token')).rejects.toThrow(BadRequestException);
    });

    it('should return invalid for already-used token', async () => {
      const mockToken = { status: 2 }; // USED
      prisma.vendor_registration_token.findFirst.mockResolvedValue(mockToken);

      await expect(service.validateToken('used-token')).rejects.toThrow(BadRequestException);
    });

    it('should return invalid for non-existent token', async () => {
      prisma.vendor_registration_token.findFirst.mockResolvedValue(null);
      await expect(service.validateToken('bad-token')).rejects.toThrow(BadRequestException);
    });
  });

  describe('createUserFromToken()', () => {
    const dto = { username: 'testuser', password: 'password123' };
    const mockToken = {
      id: 1,
      status: 1,
      expires_at: new Date(Date.now() + 100000),
      registration: { company_name: 'PT ABC', pic_name: 'PIC' }
    };

    it('should create user successfully with valid token', async () => {
      prisma.vendor_registration_token.findFirst.mockResolvedValue(mockToken);
      prisma.users.findFirst.mockResolvedValue(null); // Username valid
      prisma.roles.findFirst.mockResolvedValue({ id: 2 }); // Role Vendor Owner
      
      prisma.users.create.mockResolvedValue({ id: 10 });
      prisma.vendor.create.mockResolvedValue({ id: 20 });
      
      const result = await service.createUserFromToken('token', dto as any);
      expect(result.message).toContain('berhasil');
      expect(prisma.users.create).toHaveBeenCalled();
      expect(prisma.vendor.create).toHaveBeenCalled();
    });

    it('should activate vendor after user creation', async () => {
      prisma.vendor_registration_token.findFirst.mockResolvedValue(mockToken);
      prisma.users.findFirst.mockResolvedValue(null);
      prisma.roles.findFirst.mockResolvedValue({ id: 2 });
      
      // Implicit testing of vendor creation
      await service.createUserFromToken('token', dto as any);
      expect(prisma.vendor.create).toHaveBeenCalled();
      expect(prisma.pic_vendor.create).toHaveBeenCalled();
      expect(prisma.vendor_registration_token.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 2 }) // USED
      }));
    });

    it('should reject invalid token', async () => {
      prisma.vendor_registration_token.findFirst.mockResolvedValue(null);
      await expect(service.createUserFromToken('bad-token', dto as any)).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate username', async () => {
      prisma.vendor_registration_token.findFirst.mockResolvedValue(mockToken);
      prisma.users.findFirst.mockResolvedValue({ id: 1, username: 'testuser' }); // Already exists
      
      await expect(service.createUserFromToken('token', dto as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveRegistration()', () => {
    it('should approve registration and activate vendor (create token)', async () => {
      const mockReg = { id: 1, status: 1, email_address: 'test@pt.com', company_name: 'PT A' };
      prisma.vendor_registration.findUnique.mockResolvedValue(mockReg);
      prisma.vendor_registration.update.mockResolvedValue({ ...mockReg, status: 2 }); // APPROVED
      prisma.vendor_registration_token.create.mockResolvedValue({ token: 'abc-123' });

      await service.approveRegistration(1, 99);
      
      expect(prisma.vendor_registration.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 2 })
      }));
      expect(prisma.vendor_registration_token.create).toHaveBeenCalled();
      expect(emailQueue.add).toHaveBeenCalled(); // Should send email with token
    });

    it('should throw NotFoundException when registration not found', async () => {
      prisma.vendor_registration.findUnique.mockResolvedValue(null);
      await expect(service.approveRegistration(999, 99)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when already approved', async () => {
      prisma.vendor_registration.findUnique.mockResolvedValue({ id: 1, status: 2 }); // Already approved
      await expect(service.approveRegistration(1, 99)).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectRegistration()', () => {
    it('should reject registration with reason', async () => {
      const mockReg = { id: 1, status: 1, email_address: 'test@pt.com', company_name: 'PT A' };
      prisma.vendor_registration.findUnique.mockResolvedValue(mockReg);
      
      await service.rejectRegistration(1, { rejection_reason: 'Bad doc' }, 99);
      
      expect(prisma.vendor_registration.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 3, rejection_reason: 'Bad doc' })
      }));
      expect(emailQueue.add).toHaveBeenCalled(); // Reject email sent
    });

    it('should throw NotFoundException when registration not found', async () => {
      prisma.vendor_registration.findUnique.mockResolvedValue(null);
      await expect(service.rejectRegistration(999, { rejection_reason: '' }, 99)).rejects.toThrow(NotFoundException);
    });
  });
});
