import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, isEnum, IsNotEmpty, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { ITEM_TYPE } from '../enum/item_type.enum';

export class CreateItemDto {
  item_code?: string;
  item_name?: string;

  name: string;

  @Type(() => Number)
  @IsNumber()
  category_id: number;

  @Transform(({ value }) => Number(value))
  // @IsEnum(ITEM_TYPE)
  item_type?: ITEM_TYPE;

  @Type(() => Number)
  default_price: number;

  @Type(() => Number)
  invoice_nominal?: number;

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
  price?: number;

  @Type(() => Number)
  min_order: number;
}

class PriceStore {
  @IsOptional()
  @Type(() => Number)
  all_store?: number;

  @IsOptional()
  @Type(() => Number)
  store_id?: number;
  
  @IsOptional()
  @Type(() => Number)
  store_group_id?:number;
}