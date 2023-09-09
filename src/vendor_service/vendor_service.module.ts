import { Module } from '@nestjs/common';
import { VendorServiceService } from './vendor_service.service';
import { VendorServiceController } from './vendor_service.controller';

@Module({
  controllers: [VendorServiceController],
  providers: [VendorServiceService],
})
export class VendorServiceModule {}
