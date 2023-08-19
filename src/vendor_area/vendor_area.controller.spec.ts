import { Test, TestingModule } from '@nestjs/testing';
import { VendorAreaController } from './vendor_area.controller';
import { VendorAreaService } from './vendor_area.service';

describe('VendorAreaController', () => {
  let controller: VendorAreaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorAreaController],
      providers: [VendorAreaService],
    }).compile();

    controller = module.get<VendorAreaController>(VendorAreaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
