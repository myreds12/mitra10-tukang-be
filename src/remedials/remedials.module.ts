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
          const uniqueSuffix = Math.round(Math.random() + 1e9);
          const extension = extname(file.originalname);
          const filename = `${uniqueSuffix}${extension}`;
          callback(null, filename);
        },
      }),
    }),
  ]
})
export class RemedialsModule { }
