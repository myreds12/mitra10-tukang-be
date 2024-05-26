import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { OrderModule } from 'src/order/order.module';
import { GoogleSheetModule } from 'nest-google-sheet-connector';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  imports: [
    HttpModule,
    OrderModule,
  ],
})
export class ReportsModule {}
