import { Module } from '@nestjs/common';
import { RemedialsService } from './remedials.service';
import { RemedialsController } from './remedials.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';

@Module({
  controllers: [RemedialsController],
  providers: [RemedialsService],
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: resolveUploadPath('remedials'),
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
  ],
})
export class RemedialsModule {}
