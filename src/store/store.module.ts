import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { StatusService } from 'src/status/status.service';
import { OrderService } from 'src/order/order.service';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
      },
    }),
  ],
  controllers: [StoreController],
  providers: [StoreService, OrderService, StatusService],
})
export class StoreModule {}
