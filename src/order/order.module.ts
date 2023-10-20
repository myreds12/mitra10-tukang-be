import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { StatusModule } from 'src/status/status.module';
import { StatusService } from 'src/status/status.service';

@Module({
  controllers: [OrderController],
  providers: [OrderService, StatusService],
  exports: [OrderService],
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/receipt',
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}_${file.originalname}`;
          const filename = `${uniqueSuffix}`;
          callback(null, filename);
        },
      }),
    }),
  ],
})
export class OrderModule {}
