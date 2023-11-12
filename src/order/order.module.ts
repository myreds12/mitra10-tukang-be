import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { StatusModule } from 'src/status/status.module';
import { StatusService } from 'src/status/status.service';
import { SendEmailService } from 'src/mails/send-email.service';

@Module({
  controllers: [OrderController],
  providers: [OrderService, StatusService, SendEmailService],
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
  ],
})
export class OrderModule {}
