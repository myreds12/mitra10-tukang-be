import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, ValidateNested } from 'class-validator';
import { InvoiceDetails } from './invoice-details.dto';

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

  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  invoice_evidences?: Array<Express.Multer.File>;

  @ApiProperty()
  @Type(() => InvoiceOrder)
  invoice_orders?: InvoiceOrder[];
}


class InvoiceOrder {
  @ApiProperty()
  @Type(() => Number)
  order_id: number;
}
