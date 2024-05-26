import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class InvoiceDetails {
  @Type(() => Number)
  id?: number;

  // @IsNotEmpty()
  // @IsNumber()
  @Type(() => Number)
  quotation_id?: number;

  @Type(() => Number)
  order_id?: number;
}
