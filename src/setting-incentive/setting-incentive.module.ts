import { Module } from '@nestjs/common';
import { SettingIncentiveService } from './setting-incentive.service';
import { SettingIncentiveController } from './setting-incentive.controller';

@Module({
  controllers: [SettingIncentiveController],
  providers: [SettingIncentiveService]
})
export class SettingIncentiveModule {}
