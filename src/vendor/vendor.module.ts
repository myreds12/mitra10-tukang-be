/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { VendorService } from './vendor.service';
import { VendorController } from './vendor.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path/posix';
import { BullModule } from '@nestjs/bull';

@Module({
  controllers: [VendorController],
  providers: [VendorService],
  exports: [VendorService],
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // Maksimal 10 MB
      },
      storage: diskStorage({
        destination: './uploads/vendors', // Simpan di disk
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
      },
    }),
  ],
})
export class VendorModule {}
