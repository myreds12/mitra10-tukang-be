import { Test, TestingModule } from '@nestjs/testing';
import { VendorDocumentController } from './vendor_document.controller';
import { VendorDocumentService } from './vendor_document.service';

describe('VendorDocumentController', () => {
  let controller: VendorDocumentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorDocumentController],
      providers: [VendorDocumentService],
    }).compile();

    controller = module.get<VendorDocumentController>(VendorDocumentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
