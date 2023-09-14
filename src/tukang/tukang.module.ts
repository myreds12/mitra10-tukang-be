import { Module } from '@nestjs/common';
import { TukangService } from './tukang.service';
import { TukangController } from './tukang.controller';

@Module({
  controllers: [TukangController],
  providers: [TukangService],
})
export class TukangModule {}
