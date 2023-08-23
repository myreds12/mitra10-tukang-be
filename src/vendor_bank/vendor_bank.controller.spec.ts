import { Test, TestingModule } from '@nestjs/testing';
import { VendorBankController } from './vendor_bank.controller';
import { VendorBankService } from './vendor_bank.service';

describe('VendorBankController', () => {
  let controller: VendorBankController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorBankController],
      providers: [VendorBankService],
    }).compile();

    controller = module.get<VendorBankController>(VendorBankController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
