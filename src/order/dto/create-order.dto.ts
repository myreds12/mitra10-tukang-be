import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PAYMENT_TYPE } from '../enum/payment_type.enum';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEitherRequired } from '../decorator/is-either-required.decorator';

export class OrderDetailDto {
  @Type(() => Number)
  @IsNumber()
  order_id: number;

  @Type(() => Number)
  @IsNumber()
  item_id: number;

  @Type(() => Number)
  @IsNumber()
  order_status_id: number;

  @IsString()
  unit: string;

  @Type(() => Number)
  @IsNumber()
  unit_price: number;

  @Type(() => Number)
  @IsNumber()
  quote_price: number;

  @Type(() => Number)
  @IsNumber()
  quantity: number;

  // @Type(() => Number)
  // @IsNumber()
  // total: number;

  @Type(() => Number)
  @IsNumber()
  survey_price: number;

  @Type(() => Number)
  @IsNumber()
  comission: number;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  created_by?: number | null;

  // @Type(() => Number)
  // @IsNumber()
  // @IsOptional()
  // updated_by?: number | null;

  // @IsOptional()
  // updated_at?: string | null;

  // @IsOptional()
  // deleted_by?: number | null;

  // @IsOptional()
  // deleted_at?: string | null;
}

export class CreateOrderDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  member_id: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  category_id: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  store_id: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  sales_id: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  vendor_id: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  tukang_id: number;

  @ApiProperty()
  project_address: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  project_status_id: number;

  @ApiProperty()
  @IsEitherRequired('receipt_file')
  receipt_number: string;

  @ApiProperty({ type: 'string', format: 'binary' })
  @IsEitherRequired('receipt_number')
  receipt_file: Express.Multer.File;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  total_estimate_workdays: number;

  @ApiProperty({ enum: PAYMENT_TYPE })
  @Transform(({ value }) => value.toLocaleLowerCase())
  @IsEnum(PAYMENT_TYPE)
  payment_type: PAYMENT_TYPE;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  grand_total: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  grand_total_comission: number;

  @ApiProperty({ type: [OrderDetailDto] }) // This represents an array of OrderDetailDto
  @Type(() => OrderDetailDto)
  order_details?: OrderDetailDto[];
}
