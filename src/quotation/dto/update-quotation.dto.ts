import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, ValidateNested } from 'class-validator';
import QuotationDetails from './quotation-details';

export class UpdateQuotationDto {
  description?: string;
  quotation_number?: string;
  quotation_date: string;
  quotation_validity: string;
  quotation_disc: string;
  quotation_promotion: string;

  @Type(() => Number)
  order_id: number;

  @Type(() => Number)
  quotation_status: number;

  @Type(() => Number)
  store_id: number;
  
  @IsIn([1, 2, 3, 4])
  @Type(() => Number)
  readiness: number

  @Type(() => QuotationDetails)
  @ValidateNested({ each: true })
  quotation_details: QuotationDetails[];

  quotation_files: Express.Multer.File[];

  @Type(() => Array<Number>)
  @Transform(({ value }) => (value as Array<Number>).map(Number))
  preserve_files: number[];
}
