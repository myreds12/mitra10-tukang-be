import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsCommissionService } from './reports-commission.service';
import { ReportsOrderService } from './reports-order.service';
import { ReportsOperationsService } from './reports-operations.service';
import { ReportsGeneralService } from './reports-general.service';
import { ReportsAnalyticsService } from './reports-analytics.service';
import { ReportsController } from './reports.controller';
import { OrderModule } from 'src/order/order.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportsCommissionService,
    ReportsOrderService,
    ReportsOperationsService,
    ReportsGeneralService,
    ReportsAnalyticsService,
  ],
  exports: [
    ReportsService,
    ReportsCommissionService,
    ReportsOrderService,
    ReportsOperationsService,
    ReportsGeneralService,
    ReportsAnalyticsService,
  ],
  imports: [HttpModule, OrderModule],
})
export class ReportsModule {}
