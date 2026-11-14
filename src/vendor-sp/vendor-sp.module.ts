import { Module } from '@nestjs/common';
import { VendorSpController } from './vendor-sp.controller';
import { VendorSpService } from './vendor-sp.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfService } from '../common/services/pdf.service';
import { ReportQueryHelper } from './helpers/report-query.helper';

@Module({
  imports: [PrismaModule],
  controllers: [VendorSpController],
  providers: [VendorSpService, PdfService, ReportQueryHelper],
  exports: [VendorSpService],
})
export class VendorSpModule {}
