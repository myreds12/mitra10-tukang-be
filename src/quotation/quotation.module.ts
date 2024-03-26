import { Module } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { QuotationController } from './quotation.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { OrderService } from 'src/order/order.service';
import { OrderModule } from 'src/order/order.module';
import { StatusService } from 'src/status/status.service';
import { SendEmailService } from 'src/mails/send-email.service';

@Module({
  controllers: [QuotationController],
  providers: [QuotationService, StatusService, SendEmailService],
  imports: [
    OrderModule,
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/quotation',
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    })
  ]
})
export class QuotationModule {}
