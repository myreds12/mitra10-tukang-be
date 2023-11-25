import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

class QuotationDetails {

  @Type(() => Number)
  id?: number;
  
  @Type(() => Number)
  item_id?: number;

  @Type(() => Number)
  type?: number;
  name?: string;

  @Transform(({ value }) => Number(value))
  price?: string | number;

  @Transform(({ value }) => Number(value))
  margin?: string | number;

  @Type(() => Number)
  quantity?: number;
}

export class UpdateQuotationDto {
  description?: string;
  quotation_number?: string;
  quotation_date: string;
  quotation_validity: string;
  quotation_disc: string;

  @Type(() => Number)
  order_id: number;

  @Type(() => Number)
  quotation_status: number;

  @Type(() => Number)
  store_id: number;

  @Type(() => QuotationDetails)
  quotation_details: QuotationDetails[];

  quotation_files: Express.Multer.File[];
}
