import { Module } from '@nestjs/common';
import { RefundService } from './refund.service';
import { RefundController } from './refund.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { OrderModule } from 'src/order/order.module';
import { NotificationsService } from 'src/notifications/notifications.service';
import { ViolationDetectorService } from 'src/common/services/violation-detector.service';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';

@Module({
  controllers: [RefundController],
  providers: [RefundService, NotificationsService, ViolationDetectorService],
  exports: [RefundService, ViolationDetectorService],
  imports: [
    OrderModule,
    MulterModule.register({
      storage: diskStorage({
        destination: resolveUploadPath('refunds'),
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
  ],
})
export class RefundModule {}
