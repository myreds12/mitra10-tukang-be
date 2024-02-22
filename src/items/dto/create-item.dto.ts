import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, ValidateNested } from 'class-validator';

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
  @Type(() => PriceStore)
  @IsNotEmpty()
  @ValidateNested({ each: true })
  price_store: PriceStore[];
  
  
  periodic_start: string;
  periodic_end: string;
  
  @Type(() => Number)
  price: number;

  @Type(() => Number)
  min_order: number;
}

class PriceStore {
  @IsOptional()
  @Type(() => Number)
  store_id?: number;

  @IsOptional()
  store_group_id?:number;
}