import { Module } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { ComplaintsController } from './complaints.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { OrderModule } from 'src/order/order.module';
import { NotificationsService } from 'src/notifications/notifications.service';
import { CrmModule } from 'src/crm/crm.module';

@Module({
  controllers: [ComplaintsController],
  providers: [ComplaintsService, NotificationsService],
  imports: [
    OrderModule,
    CrmModule,
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
export class ComplaintsModule { }
