import { Module } from '@nestjs/common';
import { VendorViolationController } from './vendor-violation.controller';
import { VendorViolationService } from './vendor-violation.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VendorViolationController],
  providers: [VendorViolationService],
  exports: [VendorViolationService],
})
export class VendorViolationModule {}
