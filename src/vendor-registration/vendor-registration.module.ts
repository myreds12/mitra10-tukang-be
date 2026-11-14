import { Module } from '@nestjs/common';
import { VendorRegistrationController } from './vendor-registration.controller';
import { VendorRegistrationService } from './vendor-registration.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BullModule } from '@nestjs/bull';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    MulterModule.register({
      storage: diskStorage({
        destination: resolveUploadPath('vendors'),
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
        delay: 5000,
      },
    }),
  ],
  controllers: [VendorRegistrationController],
  providers: [VendorRegistrationService],
  exports: [VendorRegistrationService],
})
export class VendorRegistrationModule {}
