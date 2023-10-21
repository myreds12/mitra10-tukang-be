import { Module } from '@nestjs/common';
import { TukangService } from './tukang.service';
import { TukangController } from './tukang.controller';
import { diskStorage } from 'multer';
import { MulterModule } from '@nestjs/platform-express';
import { extname } from 'path';

@Module({
  controllers: [TukangController],
  providers: [TukangService],
  imports: [
    MulterModule.register({
      limits: {
        files: 12,
      },
      storage: diskStorage({
        destination: './uploads/tukang',
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
  ]
})
export class TukangModule {}
