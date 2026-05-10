import { Module } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { QuotationController } from './quotation.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { OrderModule } from 'src/order/order.module';
import { StatusService } from 'src/status/status.service';
import { BullModule } from '@nestjs/bull';
import { NotificationsService } from 'src/notifications/notifications.service';
import { ViolationDetectorService } from 'src/common/services/violation-detector.service';

@Module({
  controllers: [QuotationController],
  providers: [QuotationService, StatusService, NotificationsService, ViolationDetectorService],
  exports: [QuotationService, ViolationDetectorService],
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
    }),
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
      },
    }),
  ],
})
export class QuotationModule {}
