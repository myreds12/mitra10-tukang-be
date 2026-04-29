import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SalesIncentiveDto {
  @ApiProperty()
  @Type(() => Number)
  sales_incentive_id: number;
}
