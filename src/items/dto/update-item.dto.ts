import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

export class UpdateItemDto {
  item_code?: string;
  item_name?: string;

  @IsOptional()
  name?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  category_id?: number;

  @Type(() => Number)
  default_price?: number;

  @Type(() => Prices)
  prices?: Prices[];
}
export class Prices {
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  id?: number;

  @Type(() => Number)
  store_id?: number;

  @IsOptional()
  periodic_start?: string;
  @IsOptional()
  periodic_end?: string;

  @Type(() => Number)
  price?: number;

  @Type(() => Number)
  min_order?: number;
}
