import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class QueryParamsDto {
  @Type(() => Number)
  take?: number = 10;

  search?: string;

  @Type(() => Number)
  page?: number = 1;

  @Type(() => Number)
  skip?: number = 0;

  @Type(() => Number)
  vendor_id?: number = 0;

  @Transform((value) => value.value.split(',').map(Number))
  @Type(() => String)
  status?: number[];

  date_from?: string;
  date_to?: string;

  group_by?: string;

  order_by: 'asc' | 'desc' = 'asc';
  order_field: string = 'created_at';

  @IsOptional()
  @Type(() => Number)
  city_id?: number = 0;

  @IsOptional()
  @Type(() => Number)
  sales_id?: number = 0;
  
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  store_id?: number = 0;
  
  @IsOptional()
  @IsString()
  payment_type?: string

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  monthly: number ;
}
