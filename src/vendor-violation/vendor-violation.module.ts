import { Module } from '@nestjs/common';
import { VendorViolationController } from './vendor-violation.controller';
import { VendorViolationService } from './vendor-violation.service';
import { VendorViolationRevisionService } from './vendor-violation-revision.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VendorViolationController],
  providers: [VendorViolationService, VendorViolationRevisionService],
  exports: [VendorViolationService, VendorViolationRevisionService],
})
export class VendorViolationModule {}
