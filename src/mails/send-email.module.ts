import { Module } from '@nestjs/common';
import { SendEmailService } from './send-email.service';
import { OrderService } from 'src/order/order.service';
import { OrderModule } from 'src/order/order.module';

@Module({
  imports: [OrderModule],
  controllers: [],
  providers: [SendEmailService],
  exports: [SendEmailService],
})
export class SendEmailModule {}
