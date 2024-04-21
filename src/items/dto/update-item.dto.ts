import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  ValidateNested,
} from 'class-validator';

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
