import { Module } from '@nestjs/common';
import { ComplaintChannelService } from './complaint_channel.service';
import { ComplaintChannelController } from './complaint_channel.controller';

@Module({
  controllers: [ComplaintChannelController],
  providers: [ComplaintChannelService]
})
export class ComplaintChannelModule {}
