import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderQueryService } from './order-query.service';
import { OrderPublicService } from './order-public.service';
import { OrderCalendarService } from './order-calendar.service';
import { OrderExportService } from './order-export.service';
import { OrderExportHoService } from './order-export-ho.service';
import { OrderPdfService } from './order-pdf.service';
import { OrderFollowUpService } from './order-followup.service';
import { OrderFollowUpExportService } from './order-followup-export.service';
import { OrderStatusService } from './order-status.service';
import { OrderSchedulerService } from './order-scheduler.service';
import { OrderController } from './order.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { BullModule } from '@nestjs/bull';
import { PdfService } from 'src/common/service/pdf.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { fileFilter } from 'src/common/filters/file-filter';
import { ViolationDetectorService } from 'src/common/services/violation-detector.service';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';

@Module({
  controllers: [OrderController],
  providers: [
    OrderService,
    OrderQueryService,
    OrderPublicService,
    OrderCalendarService,
    OrderExportService,
    OrderExportHoService,
    OrderPdfService,
    OrderFollowUpService,
    OrderFollowUpExportService,
    OrderStatusService,
    OrderSchedulerService,
    PdfService,
    NotificationsService,
    ViolationDetectorService,
  ],
  exports: [
    OrderService,
    OrderQueryService,
    OrderPublicService,
    OrderCalendarService,
    OrderExportService,
    OrderExportHoService,
    OrderPdfService,
    OrderFollowUpService,
    OrderFollowUpExportService,
    OrderStatusService,
    OrderSchedulerService,
    ViolationDetectorService,
  ],
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: resolveUploadPath('receipt'),
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
      fileFilter: fileFilter,
    }),
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
        delay: 5000,
      },
    }),
  ],
})
export class OrderModule {}
