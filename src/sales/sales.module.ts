import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { AuthModule } from 'src/auth/auth.module';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: './storage/excel/sales/comission',
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
    AuthModule,
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
      },
    }),
  ],
})
export class SalesModule {}
