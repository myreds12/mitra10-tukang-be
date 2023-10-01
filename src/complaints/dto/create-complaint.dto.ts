import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateComplaintDto {
  @Type(() => Number)
  order_id: number;

  description: string;
  complaint_channel: string;
  complaint_date: string;

  @Type(() => Number)
  complaint_status: number;

  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  complaint_evidences: Array<Express.Multer.File>;
}
