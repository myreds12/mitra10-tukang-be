import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { LargeNumberLike } from 'crypto';

export class QueryParamsDto {
  @Type(() => Number)
  take?: number = 10;

  store_group_id?:number

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

  search_date_from: string;
  search_date_to: string;

  top_best: boolean;

  group_by?: string;

  order_by: 'asc' | 'desc' = 'asc';
  order_field: string = 'created_at';

  email_member: string;

  type_email_message: string;

  @IsOptional()
  @Type(() => Number)
  city_id?: number = 0;

  @IsOptional()
  @Type(() => Number)
  sales_id?: number = 0;
  
  @Transform((value) => value.value.split(',').map(Number))
  @Type(() => String)
  store_id?: number[];
  
  @IsOptional()
  @IsString()
  payment_type?: string

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  monthly: number ;

  @IsOptional()
  invoice_status: string;

  store_name?: string;

  vendor_name?: string;
  
  member_id?: number;

  order_id?:number;

  phone_number?: string;
  
  @IsOptional()
  @Type(() => Number)
  @IsIn ([0, 1])
  all_store?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn ([0, 1])
  is_free?: number;
}
