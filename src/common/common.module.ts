import { Module } from '@nestjs/common';
import { PdfService } from './service/pdf.service';

@Module({
  providers: [PdfService],
  exports: [PdfService],
})
export class CommonModule {}
