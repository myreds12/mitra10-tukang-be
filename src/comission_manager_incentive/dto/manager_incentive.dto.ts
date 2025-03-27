import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ManagerIncentiveDto {
  @ApiProperty()
  @Type(() => Number)
  manager_incentive_id: number;
}
