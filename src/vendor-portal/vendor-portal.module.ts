import { Module } from '@nestjs/common';
import { VendorPortalController } from './vendor-portal.controller';
import { VendorPortalService } from './vendor-portal.service';
import { VendorPortalGateway } from './vendor-portal.gateway';

@Module({
  controllers: [VendorPortalController],
  providers: [VendorPortalService, VendorPortalGateway],
  exports: [VendorPortalService, VendorPortalGateway],
})
export class VendorPortalModule {}
