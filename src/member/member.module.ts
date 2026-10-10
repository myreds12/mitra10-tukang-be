import { Module } from '@nestjs/common';
import { MemberService } from './member.service';
import { MemberController } from './member.controller';
import { OrderService } from 'src/order/order.service';
import { StatusService } from 'src/status/status.service';
import { BullModule } from '@nestjs/bull';
import { MailsModule } from 'src/mails/mails.module';

import { MemberExportService } from './member-export.service';
import { MemberOrderExportService } from './member-order-export.service';

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
  providers: [MemberService, MemberExportService, MemberOrderExportService],
  exports: [MemberService, MemberExportService, MemberOrderExportService],
})
export class MemberModule {}
