import { Module } from '@nestjs/common';
import { TukangServiceService } from './tukang_service.service';
import { TukangServiceController } from './tukang_service.controller';

@Module({
  controllers: [TukangServiceController],
  providers: [TukangServiceService],
})
export class TukangServiceModule {}
