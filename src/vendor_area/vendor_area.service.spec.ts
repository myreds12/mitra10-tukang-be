import { Test, TestingModule } from '@nestjs/testing';
import { VendorAreaService } from './vendor_area.service';

describe('VendorAreaService', () => {
  let service: VendorAreaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VendorAreaService],
    }).compile();

    service = module.get<VendorAreaService>(VendorAreaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
