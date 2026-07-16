import { Module } from '@nestjs/common';
import { StoreGroupService } from './store_group.service';
import { StoreGroupController } from './store_group.controller';

@Module({
  controllers: [StoreGroupController],
  providers: [StoreGroupService],
})
export class StoreGroupModule {}
