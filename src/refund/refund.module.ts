import { Module } from '@nestjs/common';
import { RefundService } from './refund.service';
import { RefundController } from './refund.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { OrderModule } from 'src/order/order.module';
import { NotificationsService } from 'src/notifications/notifications.service';

@Module({
  controllers: [RefundController],
  providers: [RefundService, NotificationsService],
  imports: [
    OrderModule,
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/refunds',
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
