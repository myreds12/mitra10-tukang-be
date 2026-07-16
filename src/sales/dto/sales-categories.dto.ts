import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class SalesCategoriesDto {
  @ApiProperty()
  @Type(() => Number)
  id?: number | undefined;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  category_id: number;

  @Type(() => String)
  @IsOptional()
  @IsString()
  commission?: string;
}
