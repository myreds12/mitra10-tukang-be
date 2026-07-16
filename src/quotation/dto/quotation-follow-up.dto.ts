import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional } from 'class-validator';

export class QuotationFollowUpDto {
  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  id: number;

  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  quotation_id: number;

  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  follow_up_1: number;

  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  follow_up_2: number;

  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  follow_up_3: number;

  @ApiProperty()
  @IsOptional()
  description: string;
}
