import { PartialType } from '@nestjs/swagger';
import { CreateSettingIncentiveDto } from './create-setting-incentive.dto';

export class UpdateSettingIncentiveDto extends PartialType(CreateSettingIncentiveDto) {}
