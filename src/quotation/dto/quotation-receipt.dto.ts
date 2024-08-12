import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional } from "class-validator";

export default class QuotationReceipt {
  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  id?: number;

  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  quotation_id?: number;

  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  quotation_step?: number;

  @ApiProperty()
  @IsOptional()
  receipt_quotation?: string;
}
