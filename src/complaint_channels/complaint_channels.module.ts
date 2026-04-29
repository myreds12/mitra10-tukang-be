import { Module } from '@nestjs/common';
import { ComplaintChannelsService } from './complaint_channels.service';
import { ComplaintChannelsController } from './complaint_channels.controller';

@Module({
  controllers: [ComplaintChannelsController],
  providers: [ComplaintChannelsService]
})
export class ComplaintChannelsModule {}
