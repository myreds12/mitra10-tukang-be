import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { PAYMENT_TYPE } from '../enum/payment_type.enum';

export class OrderDetailDto {
  @IsEmpty()
  @Type(() => Number)
  @IsNumber()
  id: number;

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

  @Type(() => Number)
  @IsNumber()
  total: number;

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

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  updated_by?: number | null;

  @IsOptional()
  updated_at?: string | null;

  @IsOptional()
  deleted_by?: number | null;

  @IsOptional()
  deleted_at?: string | null;
}

export class UpdateOrderDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  member_id: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  seles_id: number;

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
  receipt_number: string;

  @ApiProperty({ type: 'string', format: 'binary' })
  receipt_file: Express.Multer.File;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  total_estimate_workdays: number;

  @ApiProperty({ enum: PAYMENT_TYPE })
  // @IsEnum(PAYMENT_TYPE)
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
