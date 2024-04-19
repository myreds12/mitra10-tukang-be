import { Module } from '@nestjs/common';
import { MemberService } from './member.service';
import { MemberController } from './member.controller';
import { SendEmailService } from 'src/mails/send-email.service';
import { OrderService } from 'src/order/order.service';
import { StatusService } from 'src/status/status.service';

@Module({
  controllers: [MemberController],
  providers: [MemberService,  SendEmailService, OrderService, StatusService],
})
export class MemberModule {}
