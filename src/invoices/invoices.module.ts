import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, resolve } from 'path';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PdfService } from 'src/common/service/pdf.service';

const invoicesUploadPath = resolve(__dirname, '..', '..', 'uploads', 'invoices');

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, NotificationsService, PdfService],
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: invoicesUploadPath,
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
