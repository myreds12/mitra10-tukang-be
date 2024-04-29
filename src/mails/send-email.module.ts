import { Module } from '@nestjs/common';
import { EmailProcessor } from './send-email.service';
import { OrderModule } from 'src/order/order.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    OrderModule,
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
      },
    }),
  ],
  controllers: [],
  providers: [EmailProcessor],
})
export class SendEmailModule {}
