import { Module } from '@nestjs/common';
import { EmailProcessor } from './mails.processor';
import { BullModule } from '@nestjs/bull';
import { MailsController } from './mails.controller';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HttpExceptionFilter } from 'src/common/filters/http-exception.filter';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
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
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    MailsService,
  ],
})
export class MailsModule {}
