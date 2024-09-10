import { Module } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { ComplaintsController } from './complaints.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { OrderModule } from 'src/order/order.module';
import { OrderService } from 'src/order/order.service';
import { StatusService } from 'src/status/status.service';
import { NotificationsService } from 'src/notifications/notifications.service';

@Module({
  controllers: [ComplaintsController],
  providers: [ComplaintsService, NotificationsService],
  imports: [
    OrderModule,
    MulterModule.register({
      limits: {
        files: 5,
      },
      storage: diskStorage({
        destination: './uploads/complaints',
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
  ],
})
export class ComplaintsModule {}
