import { Module } from '@nestjs/common';
import { VendorService } from './vendor.service';
import { VendorController } from './vendor.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path/posix';

@Module({
  controllers: [VendorController],
  providers: [VendorService],
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
