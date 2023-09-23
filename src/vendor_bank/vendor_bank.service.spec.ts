import { Test, TestingModule } from '@nestjs/testing';
import { VendorBankService } from './vendor_bank.service';

describe('VendorBankService', () => {
  let service: VendorBankService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VendorBankService],
    }).compile();

    service = module.get<VendorBankService>(VendorBankService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
