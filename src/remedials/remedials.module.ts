import { Module } from '@nestjs/common';
import { RemedialsService } from './remedials.service';
import { RemedialsController } from './remedials.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Module({
  controllers: [RemedialsController],
  providers: [RemedialsService],
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/remedials',
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}_${file.originalname}`;
          const filename = `${uniqueSuffix}`;
          callback(null, filename);
        },
      }),
    }),
  ],
})
export class RemedialsModule {}
