import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsOptional,
  IsNumber,
  IsEnum,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { PAYMENT_TYPE } from '../enum/payment_type.enum';
import { OrderDetailDto } from './order-details.dto';
import { UpdatedOrderFiles } from './update.order.files.dto';

export class UpdateOrderDto {
  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  order_files: Array<Express.Multer.File>;

  @ValidateNested({ each: true })
  @Type(() => UpdatedOrderFiles)
  existing_order_files?: UpdatedOrderFiles[];

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  is_overdistance?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => {
    const val = Array.isArray(value) ? value[0] : value;
    return Number(val);
  })
  member_id?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsOptional()
  store_id?: number;

  @IsOptional()
  request_work?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => {
    const val = Array.isArray(value) ? value[0] : value;
    return Number(val);
  })
  sales_id?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsOptional()
  vendor_id?: number;

  @ApiProperty()
  project_address?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsOptional()
  project_status_id?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => Array.isArray(value) ? value[0] : value)
  receipt_number?: string;

  @ApiProperty({ enum: PAYMENT_TYPE })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLocaleLowerCase() : value,
  )
  // @IsEnum(PAYMENT_TYPE)
  @IsOptional()
  payment_type?: PAYMENT_TYPE;

  @IsOptional()
  @Type(() => Number)
  additional_fee?: number;

  @Type(() => OrderDetailDto)
  order_details?: OrderDetailDto[];

  request_survey?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => Array.isArray(value) ? value[0] : value)
  notes?: string;
}
