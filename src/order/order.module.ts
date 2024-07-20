import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { BullModule } from '@nestjs/bull';
import { PdfService } from 'src/common/service/pdf.service';

@Module({
  controllers: [OrderController],
  providers: [OrderService, PdfService],
  exports: [OrderService],
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/receipt',
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
export class OrderModule {}
