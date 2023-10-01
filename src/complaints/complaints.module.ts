import { Module } from '@nestjs/common';
import { ComplaintsService } from './complaints.service';
import { ComplaintsController } from './complaints.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Module({
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
  imports: [
    MulterModule.register({
      limits: {
        files: 5,
      },
      storage: diskStorage({
        destination: './uploads/complaints',
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
export class ComplaintsModule {}
