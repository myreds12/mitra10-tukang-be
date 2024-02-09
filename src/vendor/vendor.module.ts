import { Module } from '@nestjs/common';
import { VendorService } from './vendor.service';
import { VendorController } from './vendor.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path/posix';
import { SendEmailService } from 'src/mails/send-email.service';
import { OrderService } from 'src/order/order.service';
import { StatusService } from 'src/status/status.service';

@Module({
  controllers: [VendorController],
  providers: [VendorService, SendEmailService, OrderService, StatusService],
  exports: [VendorService],
  imports: [
    MulterModule.register({
      limits: {
        files: 12,
      },
      storage: diskStorage({
        destination: './uploads/vendors',
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
  ],
})
export class VendorModule {}
