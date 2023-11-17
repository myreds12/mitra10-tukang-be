import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';

export class UpdateInvoiceDto {
  @ApiProperty()
  request_work_time: string;
  survey_date: string;
  work_start_date: string;
  work_end_date: string;

  @Type(() => Number)
  order_id: number;

  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  invoice_evidences?: Array<Express.Multer.File>;
}
