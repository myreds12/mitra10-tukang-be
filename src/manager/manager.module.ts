import { Module } from '@nestjs/common';
import { ManagerService } from './manager.service';
import { ManagerController } from './manager.controller';
import { AuthModule } from 'src/auth/auth.module';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ManagerExportService } from './manager-export.service';
import { ManagerIncentiveService } from './manager-incentive.service';
import { NotificationsService } from 'src/notifications/notifications.service';

@Module({
  controllers: [ManagerController],
  providers: [
    ManagerService,
    ManagerExportService,
    ManagerIncentiveService,
    NotificationsService,
  ],
  exports: [ManagerService, ManagerExportService, ManagerIncentiveService],
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: './storage/excel/sales/comission',
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
    AuthModule,
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
      },
    }),
  ],
})
export class ManagerModule {}
