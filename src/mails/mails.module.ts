import { Module } from '@nestjs/common';
import { EmailProcessor } from './mails.processor';
import { BullModule } from '@nestjs/bull';
import { MailsController } from './mails.controller';
import { MailsService } from './mails.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        attempts: 3,
        delay: 20000,
      },
    }),
  ],
  controllers: [MailsController],
  providers: [
    EmailProcessor,
    MailsService,
  ],
})
export class MailsModule {}
