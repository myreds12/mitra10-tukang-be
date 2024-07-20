import { Module } from '@nestjs/common';
import { MemberService } from './member.service';
import { MemberController } from './member.controller';
import { OrderService } from 'src/order/order.service';
import { StatusService } from 'src/status/status.service';
import { BullModule } from '@nestjs/bull';
import { MailsModule } from 'src/mails/mails.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
      },
    }),
  ],
  controllers: [MemberController],
  providers: [MemberService],
})
export class MemberModule {}
