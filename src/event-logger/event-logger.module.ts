import { Module } from '@nestjs/common';
import { EventLoggerService } from './event-logger.service';

@Module({
  providers: [EventLoggerService],
})
export class EventLoggerModule { }
