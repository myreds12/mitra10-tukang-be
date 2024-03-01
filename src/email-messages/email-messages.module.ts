import { Module } from '@nestjs/common';
import { EmailMessagesService } from './email-messages.service';
import { EmailMessagesController } from './email-messages.controller';

@Module({
  controllers: [EmailMessagesController],
  providers: [EmailMessagesService]
})
export class EmailMessagesModule {}
