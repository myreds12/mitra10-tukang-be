import { Module } from '@nestjs/common';
import { WorkOrdersService } from './work_orders.service';
import { WorkOrdersController } from './work_orders.controller';

@Module({
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService]
})
export class WorkOrdersModule {}
