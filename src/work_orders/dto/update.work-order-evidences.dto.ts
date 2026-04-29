import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdatedWorkOrderEvidences {
  @ApiProperty()
  @Type(() => Number)
  work_order_evidence_id?: number;
}
