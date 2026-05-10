import { Module } from '@nestjs/common';
import { EmailProcessor } from './mails.processor';
import { BullModule } from '@nestjs/bull';
import { MailsController } from './mails.controller';
import { MailsService } from './mails.service';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    }),
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/mails-image',
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
  ],
  controllers: [MailsController],
  providers: [
    EmailProcessor,
    MailsService,
  ],
})
export class MailsModule {}
