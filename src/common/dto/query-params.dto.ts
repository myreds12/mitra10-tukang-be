import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { LargeNumberLike } from 'crypto';

export class QueryParamsDto {
  @IsOptional()
  @IsNotEmpty()
  @Type(() => Number)
  @Transform(({ value }) => (value === 0 ? 100 : value))
  take?: number = 10;

  @IsOptional()
  @IsNotEmpty()
  store_group_id?: number;

  @IsOptional()
  @IsNotEmpty()
  search?: string;

  @IsOptional()
  @IsNotEmpty()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNotEmpty()
  @Type(() => Number)
  skip?: number = 0;

  @IsOptional()
  @IsNotEmpty()
  @Type(() => Number)
  vendor_id?: number = 0;

  @IsOptional()
  @IsNotEmpty()
  @Transform((value) => value.value.split(',').filter(Boolean).map(Number))
  @Type(() => Array<Number>)
  status?: number[];

  @IsOptional()
  @Type(() => Number)
  invoice_status?: number;

  @IsOptional()
  @IsNotEmpty()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsNotEmpty()
  search_date_from: string;

  @IsOptional()
  @IsNotEmpty()
  search_date_to: string;

  @IsOptional()
  @IsNotEmpty()
  top_best: boolean;

  @IsOptional()
  @IsNotEmpty()
  group_by?: string;

  @IsOptional()
  @IsNotEmpty()
  order_by: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @IsNotEmpty()
  order_field: string = 'created_at';

  @IsOptional()
  @IsNotEmpty()
  email_member: string;

  @IsOptional()
  @IsNotEmpty()
  type_email_message: number;

  @IsOptional()
  @IsNotEmpty()
  @Type(() => Number)
  area_id?: number = 0;

  @IsOptional()
  @IsNotEmpty()
  @Type(() => Number)
  sales_id?: number = 0;

  @IsOptional()
  @IsNotEmpty()
  @Type(() => Number)
  tukang_id?: number = 0;

  @IsOptional()
  @IsNotEmpty()
  @Transform((value) => value.value.split(',').map(Number))
  @Type(() => String)
  store_id?: number[];

  @IsOptional()
  @IsNotEmpty()
  @Transform((value) => value.value.split(',').map(Number))
  @Type(() => String)
  service_types?: number[];

  @IsOptional()
  @IsNotEmpty()
  @IsString()
  payment_type?: string;

  @IsOptional()
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  monthly: number;

  @IsOptional()
  @IsNotEmpty()
  @Transform((value) => {
    console.log('DTO', value);
    return Boolean(value);
  })
  vendor_with_max_order?: boolean = false;


  @IsOptional()
  @IsNotEmpty()
  store_name?: string;

  @IsOptional()
  @IsNotEmpty()
  vendor_name?: string;

  @IsOptional()
  @IsNotEmpty()
  member_id?: number;

  @IsOptional()
  @IsNotEmpty()
  order_id?: number;

  @IsOptional()
  @IsNotEmpty()
  phone_number?: string;

  @IsOptional()
  @IsNotEmpty()
  member_number?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  all_store?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  is_free?: number;
}
