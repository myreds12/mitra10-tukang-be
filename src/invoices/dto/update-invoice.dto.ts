import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Validate, ValidateNested } from 'class-validator';
import { InvoiceDetails } from './invoice-details.dto';

export class UpdateInvoiceDto {
  @IsOptional()
  @Type(() => Number)
  invoice_id?:number[]
  @IsOptional()
  @IsString()
  request_work_time?: string;
  @IsOptional()
  @IsString()
  survey_date?: string;
  
  @IsOptional()
  @IsString()
  work_start_date?: string;
  
  @IsOptional()
  @IsString()
  work_end_date?: string;
  
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;
  
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InvoiceDetails)
  invoice_details?: InvoiceDetails[];
  
  @IsOptional()
  @Type(() => Number)
  status?: number;
  
  @IsOptional()
  @Type(() => Number)
  order_id?: number;

  @IsOptional()
  @Type(() => Number)
  pph_nominal?: number;

  @IsOptional()
  @Type(() => Number)
  ppn_nominal?: number;

  @IsOptional()
  @Type(() => Number)
  pkp_nominal?: number;
  
  @IsOptional()
  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  invoice_evidences?: Array<Express.Multer.File>;
}
