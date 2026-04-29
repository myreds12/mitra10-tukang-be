import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import QuotationDetails from './quotation-details';
import { QuotationFollowUpDto } from './quotation-follow-up.dto';

class QuotationFile {
  id?: number;
  type?: string;
  file: Express.Multer.File;
}

export class CreateQuotationDto {
  description: string;
  quotation_number: string;
  quotation_date: string;
  quotation_validity: string;
  quotation_disc: string;
  quotation_promotion: string;

  @Type(() => Number)
  order_id: number;

  @IsOptional()
  @Type(() => Number)
  promotion_id?: number;

  @IsOptional()
  @Type(() => Number)
  quotation_special?: number;

  @Type(() => Number)
  store_id: number;

  @Type(() => QuotationDetails)
  @ValidateNested({ each: true })
  quotation_details: QuotationDetails[];

  quotation_files: Express.Multer.File[];

  @Type(() => QuotationFile)
  @ValidateNested({ each: true })
  quotation_files_new: QuotationFile[];

  @Type(() => QuotationFollowUpDto)
  @ValidateNested({ each: true })
  quotation_follow_up: QuotationFollowUpDto[];
}
