import { Module } from '@nestjs/common';
import { WorkOrdersService } from './work_orders.service';
import { WorkOrdersController } from './work_orders.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { OrderModule } from 'src/order/order.module';
import { VendorModule } from 'src/vendor/vendor.module';
import { BullModule } from '@nestjs/bull';
import { ViolationDetectorService } from 'src/common/services/violation-detector.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';
import { WorkOrdersQueryService } from './work-orders-query.service';
import { WorkOrdersStatusService } from './work-orders-status.service';

@Module({
  controllers: [WorkOrdersController],
  providers: [
    WorkOrdersService,
    WorkOrdersQueryService,
    WorkOrdersStatusService,
    ViolationDetectorService,
    NotificationsService,
  ],
  exports: [
    WorkOrdersService,
    WorkOrdersQueryService,
    WorkOrdersStatusService,
    ViolationDetectorService,
  ],
  imports: [
    OrderModule,
    VendorModule,
    MulterModule.register({
      storage: diskStorage({
        destination: resolveUploadPath('work-orders'),
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
        delay: 5000,
      },
    }),
  ],
})
export class WorkOrdersModule {}
