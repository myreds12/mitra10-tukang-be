import { Module } from '@nestjs/common';
import { WorkOrdersService } from './work_orders.service';
import { WorkOrdersController } from './work_orders.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Module({
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
  imports: [MulterModule.register({
    storage: diskStorage({
      destination: './uploads/work-orders',
      filename(req, file, callback) {
        const uniqueSuffix = `${Date.now()}`;
        const filename = `${uniqueSuffix}${extname(file.originalname)}`;
        callback(null, filename);
      },
    }),
  }),]
})
export class WorkOrdersModule { }
