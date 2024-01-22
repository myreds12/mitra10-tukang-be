import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class OrderDetailDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  id?: number;

  // @Type(() => Number)
  // @IsNumber()
  // order_id: number;

  @Type(() => Number)
  item_id?: number;

  @IsOptional()
  @IsString()
  item_notes?: string;
  
  @Type(() => Number)
  @IsNumber()
  quantity: number;
  
  @IsOptional()
  @IsString()
  item_code?: string;
  
  @IsOptional()
  @IsString()
  item_name?: string;

  @IsOptional()
  @Type(() => Number)
  category_id: number
}
