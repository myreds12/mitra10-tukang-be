import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { OrderModule } from 'src/order/order.module';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  imports: [OrderModule]
})
export class ReportsModule { }
