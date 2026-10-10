import { Module } from '@nestjs/common';
import { VendorSpController } from './vendor-sp.controller';
import { VendorSpService } from './vendor-sp.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PdfService } from '../common/services/pdf.service';
import { ReportQueryHelper } from './helpers/report-query.helper';

import { VendorSpPdfService } from './vendor-sp-pdf.service';
import { VendorSpWarningService } from './vendor-sp-warning.service';

@Module({
  imports: [PrismaModule],
  controllers: [VendorSpController],
  providers: [
    VendorSpService,
    VendorSpPdfService,
    VendorSpWarningService,
    PdfService,
    ReportQueryHelper,
  ],
  exports: [VendorSpService, VendorSpPdfService, VendorSpWarningService],
})
export class VendorSpModule {}
