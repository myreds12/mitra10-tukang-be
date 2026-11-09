import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { AiReportDataService } from './ai-report-data.service';
import { AiSessionStateService } from './ai-session-state.service';
import { AiSqlExecutorService } from './ai-sql-executor.service';
import { OrderModule } from 'src/order/order.module';
import { WorkOrdersModule } from 'src/work_orders/work_orders.module';
import { RescheduleModule } from 'src/reschedule/reschedule.module';
import { RemedialsModule } from 'src/remedials/remedials.module';
import { VendorSpModule } from 'src/vendor-sp/vendor-sp.module';
import { VendorViolationModule } from 'src/vendor-violation/vendor-violation.module';
import { VendorModule } from 'src/vendor/vendor.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, AiReportDataService, AiSessionStateService, AiSqlExecutorService],
  exports: [ReportsService, AiReportDataService, AiSessionStateService, AiSqlExecutorService],
  imports: [
    HttpModule,
    OrderModule,
    WorkOrdersModule,
    RescheduleModule,
    RemedialsModule,
    VendorSpModule,
    VendorViolationModule,
    VendorModule,
  ],
})
export class ReportsModule {}
