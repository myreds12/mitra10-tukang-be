import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { InvoiceDetails } from './invoice-details.dto';
import { InvoiceStatus } from './invoice-status.enum';

export class CreateInvoiceDto {
  // @ApiProperty()
  // request_work_time: string;
  // survey_date: string;
  // work_start_date: string;
  // work_end_date: string;

  @ValidateNested({ each: true })
  @Type(() => InvoiceDetails)
  invoice_details?: InvoiceDetails[];

  order_id?: number;

  @IsNotEmpty()
  @Type(() => Number)
  vendor_id: number;

  @IsOptional()
  @Type(() => Number)
  pph_nominal?: number;

  @IsOptional()
  @Type(() => Number)
  ppn_nominal?: number;

  @IsOptional()
  @Type(() => Number)
  pkp_nominal?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsEnum(InvoiceStatus)
  status: InvoiceStatus

  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  invoice_evidences?: Array<Express.Multer.File>;
}



