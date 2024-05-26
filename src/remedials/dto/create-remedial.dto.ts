import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateRemedialDto {
  @Type(() => Number)
  complaint_id: number;

  remedial_action: string;

  ra_date_start: string;
  ra_date_end?: string;

  @Type(() => Number)
  remedial_pic: number;

  @Type(() => String)
  remedial_pic_position: string;

  @Type(() => Number)
  remedial_status: number;

  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  remedial_evidences?: Array<Express.Multer.File>;
}
