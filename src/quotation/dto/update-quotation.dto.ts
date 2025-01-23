import { Transform, Type } from 'class-transformer';
import { IsIn, IsOptional, ValidateNested } from 'class-validator';
import QuotationDetails from './quotation-details';
import { ApiProperty } from '@nestjs/swagger';
import QuotationReceipt from './quotation-receipt.dto';

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

  @ApiProperty()
  @IsOptional()
  receipt_quotation: string;

  @Type(() => Number)
  store_id: number;

  @IsIn([1, 2, 3, 4])
  @Type(() => Number)
  readiness = 1;

  @IsOptional()
  @Type(() => Number)
  promotion_id?: number;

  @IsOptional()
  @Type(() => Number)
  quotation_special?: number;

  @Type(() => QuotationReceipt)
  @ValidateNested({ each: true })
  receipts_quotation?: QuotationReceipt[];

  @Type(() => QuotationDetails)
  @ValidateNested({ each: true })
  quotation_details: QuotationDetails[];

  quotation_files: Express.Multer.File[];
  quotation_receipts: Express.Multer.File[];

  @Type(() => Array<number>)
  @Transform(({ value }) => (value as Array<number>).map(Number))
  preserve_files: number[];
}
