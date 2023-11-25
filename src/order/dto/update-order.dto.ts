import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { PAYMENT_TYPE } from '../enum/payment_type.enum';
import { OrderDetailDto } from './order-details.dto';

export class UpdateOrderDto {
  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  order_files: Array<Express.Multer.File>;

  @ApiProperty()
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  member_id?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  store_id?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  sales_id?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  vendor_id?: number;

  @ApiProperty()
  project_address?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  project_status_id?: number;

  @ApiProperty()
  receipt_number?: string;

  @ApiProperty({ enum: PAYMENT_TYPE })
  @Transform(({ value }) => value.toLocaleLowerCase())
  @IsEnum(PAYMENT_TYPE)
  @IsOptional()
  payment_type?: PAYMENT_TYPE;

  @Type(() => OrderDetailDto)
  order_details?: OrderDetailDto[];

  request_survey?: string;
}
