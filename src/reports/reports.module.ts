import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { OrderModule } from 'src/order/order.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  imports: [HttpModule, OrderModule],
})
export class ReportsModule {}
