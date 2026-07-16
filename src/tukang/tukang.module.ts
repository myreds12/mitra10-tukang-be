import { Module } from '@nestjs/common';
import { TukangService } from './tukang.service';
import { TukangController } from './tukang.controller';
import { diskStorage } from 'multer';
import { MulterModule } from '@nestjs/platform-express';
import { extname } from 'path';
import { BullModule } from '@nestjs/bull';
import { PdfService } from 'src/common/service/pdf.service';

@Module({
  controllers: [TukangController],
  providers: [TukangService, PdfService],
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
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
      },
    }),
  ],
})
export class TukangModule {}
