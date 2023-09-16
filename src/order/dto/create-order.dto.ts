import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PAYMENT_TYPE } from '../enum/payment_type.enum';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class OrderDetailDto {
  @Type(() => Number)
  order_id: number;

  @Type(() => Number)
  item_id: number;

  @Type(() => Number)
  order_status_id: number;

  @IsString()
  unit: string;

  @Type(() => Number)
  unit_price: number;

  @Type(() => Number)
  quote_price: number;

  @Type(() => Number)
  quantity: number;

  @Type(() => Number)
  total: number;

  @Type(() => Number)
  survey_price: number;

  @Type(() => Number)
  comission: number;

  @Type(() => Number)
  @IsOptional()
  created_by?: number | null;

  @Type(() => Number)
  @IsOptional()
  updated_by?: number | null;

  @IsOptional()
  updated_at?: string | null;

  @IsOptional()
  deleted_by?: number | null;

  @IsOptional()
  deleted_at?: string | null;
}

export class CreateOrderDto {
  @ApiProperty()
  @Type(() => Number)
  member_id: number;

  @ApiProperty()
  @Type(() => Number)
  seles_id: number;

  @ApiProperty()
  @Type(() => Number)
  vendor_id: number;

  @ApiProperty()
  @Type(() => Number)
  tukang_id: number;

  @ApiProperty()
  project_address: string;

  @ApiProperty()
  @Type(() => Number)
  project_status_id: number;

  @ApiProperty()
  receipt_number: string;

  @ApiProperty({ type: 'string', format: 'binary' })
  receipt_file: Express.Multer.File;

  @ApiProperty()
  @Type(() => Number)
  total_estimate_workdays: number;

  @ApiProperty({ enum: PAYMENT_TYPE })
  // @IsEnum(PAYMENT_TYPE)
  payment_type: PAYMENT_TYPE;

  @ApiProperty()
  @Type(() => Number)
  grand_total: number;

  @ApiProperty()
  @Type(() => Number)
  grand_total_comission: number;

  @ApiProperty({ type: [OrderDetailDto] }) // This represents an array of OrderDetailDto
  @Type(() => OrderDetailDto)
  order_details?: OrderDetailDto[];
}
