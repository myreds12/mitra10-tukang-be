import { Module } from '@nestjs/common';
import { ComissionSalesIncentiveService } from './comission_sales_incentive.service';
import { ComissionSalesIncentiveController } from './comission_sales_incentive.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Module({
  controllers: [ComissionSalesIncentiveController],
  providers: [ComissionSalesIncentiveService],
  imports: [MulterModule.register({
    storage: diskStorage({
      destination: './uploads/comission-sales-incentive',
      filename(req, file, callback) {
        const uniqueSuffix = `${Date.now()}`;
        const filename = `${uniqueSuffix}${extname(file.originalname)}`;
        callback(null, filename);
      },
    }),
  }),]
})
export class ComissionSalesIncentiveModule {}
