import { Module } from '@nestjs/common';
import { SendEmailService } from './send-email.service';
import { OrderService } from 'src/order/order.service';

@Module({
  controllers: [],
  providers: [SendEmailService],
  exports: [SendEmailService],
  imports:[OrderService],
})
export class SendEmailModule {}