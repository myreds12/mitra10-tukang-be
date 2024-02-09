import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { StatusService } from 'src/status/status.service';
import { OrderService } from 'src/order/order.service';
import { SendEmailService } from 'src/mails/send-email.service';

@Module({
  controllers: [StoreController],
  providers: [StoreService, SendEmailService, OrderService, StatusService],
})
export class StoreModule {}
