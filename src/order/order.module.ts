import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { APP_GUARD } from '@nestjs/core';
import { PermissionsGuard } from 'src/auth/guards/permission.guard';

@Module({
  controllers: [OrderController],
  providers: [
    OrderService,
    // {
    //   provide: APP_GUARD,
    //   useClass: PermissionsGuard,
    // },
  ],
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/receipt',
        filename(req, file, callback) {
          const uniqueSuffix = Math.round(Math.random() + 1e9);
          const extension = extname(file.originalname);
          const filename = `${uniqueSuffix}${extension}`;
          callback(null, filename);
        },
      }),
    }),
  ],
})
export class OrderModule {}
