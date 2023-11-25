import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class OrderDetailDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @Type(() => Number)
  @IsNumber()
  order_id: number;

  @Type(() => Number)
  @IsNumber()
  item_id: number;

  @Type(() => Number)
  @IsNumber()
  quantity: number;

  @IsString()
  item_code: string;

  @IsString()
  item_name: string;
}
