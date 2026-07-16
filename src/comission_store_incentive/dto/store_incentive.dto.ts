import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class StoreIncentiveDto {
  @ApiProperty()
  @Type(() => Number)
  store_incentive_id: number;
}
