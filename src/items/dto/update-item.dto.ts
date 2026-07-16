import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Max,
  ValidateNested,
} from 'class-validator';
import { ITEM_TYPE } from '../enum/item_type.enum';

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
  
  @Transform(({ value }) => Number(value))
  // @IsEnum(ITEM_TYPE)
  item_type?: ITEM_TYPE;
  
  @IsOptional()
  @Type(() => Number)
  is_active?: number;

  @Type(() => Number)
  @Max(999999999)
  invoice_nominal?: number;


  @Type(() => Prices)
  @IsNotEmpty()
  @ValidateNested({ each: true })
  prices?: Prices[];
}
export class Prices {
  @Transform(
    // ({ value }) => (value !== null && value !== 0 ? Number(value) : undefined),
    ({ value }) => Number(value),
    {
      toClassOnly: true,
    },
  )
  @IsOptional()
  @IsNumber()
  id?: number | null;

  @IsOptional()
  @Type(() => Number)
  is_active?: number;

  @Type(() => PriceStore)
  @IsNotEmpty()
  @ValidateNested({ each: true })
  price_store: PriceStore[];

  @IsOptional()
  periodic_start?: string;

  @IsOptional()
  periodic_end?: string;

  @Type(() => Number)
  price?: number;

  @Type(() => Number)
  min_order?: number;
}

class PriceStore {
  @Transform(
    // ({ value }) => (value !== null && value !== 0 ? Number(value) : undefined),
    ({ value }) => Number(value),
    {
      toClassOnly: true,
    },
  )
  @IsOptional()
  @IsNumber()
  id?: number | null;

  @IsOptional()
  @Type(() => Number)
  all_store?: number;

  @IsOptional()
  @Type(() => Number)
  store_id?: number;

  @IsOptional()
  @Type(() => Number)
  store_group_id?: number;
}
