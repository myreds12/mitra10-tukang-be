import { Module } from '@nestjs/common';
import { VendorViolationController } from './vendor-violation.controller';
import { VendorViolationService } from './vendor-violation.service';
import { VendorViolationRevisionService } from './vendor-violation-revision.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VendorSpModule } from '../vendor-sp/vendor-sp.module';
import { ViolationDetectorService } from '../common/services/violation-detector.service';
import { VendorViolationScheduler } from '../scheduler/vendor-violation.scheduler';

@Module({
  imports: [PrismaModule, NotificationsModule, VendorSpModule],
  controllers: [VendorViolationController],
  providers: [
    VendorViolationService,
    VendorViolationRevisionService,
    ViolationDetectorService,
    VendorViolationScheduler,
  ],
  exports: [
    VendorViolationService,
    VendorViolationRevisionService,
    VendorViolationScheduler,
  ],
})
export class VendorViolationModule {}
