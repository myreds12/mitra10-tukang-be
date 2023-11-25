import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, ValidateNested } from 'class-validator';

export class CreateItemDto {
  item_code?: string;
  item_name?: string;

  name: string;

  @Type(() => Number)
  @IsNumber()
  category_id: number;

  @Type(() => Number)
  default_price: number;

  @Type(() => Prices)
  @IsNotEmpty()
  @ValidateNested({ each: true })
  prices: Prices[];
}
class Prices {
  @Type(() => Number)
  store_id: number;

  periodic_start: string;
  periodic_end: string;

  @Type(() => Number)
  price: number;

  @Type(() => Number)
  min_order: number;
}
