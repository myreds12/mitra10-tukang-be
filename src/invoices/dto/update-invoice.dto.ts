import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString, Validate, ValidateNested } from 'class-validator';
import { InvoiceDetails } from './invoice-details.dto';

export class UpdateInvoiceDto {
  @IsString()
  request_work_time: string;
  @IsString()
  survey_date: string;

  @IsString()
  work_start_date: string;

  @IsString()
  work_end_date: string;

  @IsString()
  description: string;

  @ValidateNested({ each: true })
  @Type(() => InvoiceDetails)
  invoice_details: InvoiceDetails[];

  @Type(() => Number)
  status_id: number;

  @Type(() => Number)
  order_id: number;

  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  invoice_evidences?: Array<Express.Multer.File>;
}
