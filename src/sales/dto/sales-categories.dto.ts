import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsCurrency, IsDecimal, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class SalesCategoriesDto {
  @ApiProperty()
  @Type(() => Number)
  id?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  category_id: number;
  
  @Type(() => String)
  @IsString()
  @IsNotEmpty()
  commission: string;
}
