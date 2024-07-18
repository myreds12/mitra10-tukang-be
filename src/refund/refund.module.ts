import { Module } from '@nestjs/common';
import { RefundService } from './refund.service';
import { RefundController } from './refund.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { OrderModule } from 'src/order/order.module';

@Module({
  controllers: [RefundController],
  providers: [RefundService],
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
