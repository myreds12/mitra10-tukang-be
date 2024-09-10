import { Module } from '@nestjs/common';
import { OrderModule } from 'src/order/order.module';
import { RescheduleService } from './reschedule.service';
import { RescheduleController } from './reschedule.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { NotificationsService } from 'src/notifications/notifications.service';

@Module({
  controllers: [RescheduleController],
  providers: [RescheduleService, NotificationsService],
  imports: [
    OrderModule,
    MulterModule.register({
      limits: {
        files: 12,
      },
      storage: diskStorage({
        destination: './uploads/reschedule',
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
  ],
})
export class RescheduleModule {}
