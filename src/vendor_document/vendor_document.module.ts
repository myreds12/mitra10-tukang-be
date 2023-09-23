import { Module } from '@nestjs/common';
import { VendorDocumentService } from './vendor_document.service';
import { VendorDocumentController } from './vendor_document.controller';

@Module({
  controllers: [VendorDocumentController],
  providers: [VendorDocumentService]
})
export class VendorDocumentModule {}
