import { Module } from '@nestjs/common';
import { VendorAreaService } from './vendor_area.service';
import { VendorAreaController } from './vendor_area.controller';

@Module({
  controllers: [VendorAreaController],
  providers: [VendorAreaService],
})
export class VendorAreaModule {}
