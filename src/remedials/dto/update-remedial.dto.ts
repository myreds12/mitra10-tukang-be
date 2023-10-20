import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateRemedialDto {
  @Type(() => Number)
  complaint_id: number;

  @ApiProperty()
  remedial_action: string;

  ra_date_start: string;
  ra_date_end: string;

  remedial_pic: number;

  @Type(() => Number)
  remedial_status?: number;

  remedial_evidences: Array<Express.Multer.File>;
}
