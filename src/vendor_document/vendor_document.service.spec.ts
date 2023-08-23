import { Test, TestingModule } from '@nestjs/testing';
import { VendorDocumentService } from './vendor_document.service';

describe('VendorDocumentService', () => {
  let service: VendorDocumentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VendorDocumentService],
    }).compile();

    service = module.get<VendorDocumentService>(VendorDocumentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
