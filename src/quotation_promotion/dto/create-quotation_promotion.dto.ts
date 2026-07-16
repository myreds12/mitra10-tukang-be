import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional } from 'class-validator';

export class CreateQuotationPromotionDto {
  @ApiProperty()
  @Type(() => Number)
  quotation_id: number;

  @ApiProperty()
  @IsNotEmpty()
  promotion_nominal: number;

  @ApiProperty()
  @Type(() => Number)
  status: number;

  @ApiProperty()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsOptional()
  notes?: string;
}
