import { Module } from '@nestjs/common';
import { RefundService } from './refund.service';
import { RefundController } from './refund.controller';

@Module({
  controllers: [RefundController],
  providers: [RefundService]
})
export class RefundModule {}
