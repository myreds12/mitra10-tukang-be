import { Module } from '@nestjs/common';
import { IncentiveService } from './incentive.service';
import { IncentiveController } from './incentive.controller';

@Module({
  controllers: [IncentiveController],
  providers: [IncentiveService],
})
export class IncentiveModule {}
