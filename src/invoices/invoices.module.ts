import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PdfService } from 'src/common/service/pdf.service';
import { resolveUploadPath } from 'src/common/utils/upload-path.util';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, NotificationsService, PdfService],
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: resolveUploadPath('invoices'),
        filename(req, file, callback) {
          const uniqueSuffix = `${Date.now()}`;
          const filename = `${uniqueSuffix}${extname(file.originalname)}`;
          callback(null, filename);
        },
      }),
    }),
  ],
})
export class InvoicesModule { }
