import { Module } from '@nestjs/common';
import { QuotationPromotionService } from './quotation_promotion.service';
import { QuotationPromotionController } from './quotation_promotion.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PdfService } from 'src/common/service/pdf.service';
import { NotificationsService } from 'src/notifications/notifications.service';

@Module({
  controllers: [QuotationPromotionController],
  providers: [QuotationPromotionService, PdfService, NotificationsService],
  imports: [
    MulterModule.register({
    storage: diskStorage({
      destination: './uploads/quotation-promotion',

      filename(req, file, callback) {
        const uniqueSuffix = `${Date.now()}`;
        const filename = `${uniqueSuffix}${extname(file.originalname)}`;
        callback(null, filename);
      },
    }),
  }),
]
})
export class QuotationPromotionModule { }
