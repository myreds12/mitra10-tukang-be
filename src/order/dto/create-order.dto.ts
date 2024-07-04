import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PAYMENT_TYPE } from '../enum/payment_type.enum';
import { ApiBody, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEitherRequired } from '../../common/decorator/is-either-required.decorator';
import { OrderDetailDto } from './order-details.dto';

export class CreateOrderDto {
  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  order_files: Array<Express.Multer.File>;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  member_id: number;

  @ApiProperty()
  @Type(() => Number)
  project_status_id: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  store_id: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  sales_id?: number;

  @ApiProperty()
  @Type(() => Number)
  vendor_id?: number;

  @ApiProperty()
  project_address: string;

  @IsNotEmpty()
  @IsString()
  project_number: string;

  @ApiProperty()
  receipt_number?: string;

  @ApiProperty({ enum: PAYMENT_TYPE })
  @Transform(({ value }) => value.toLocaleLowerCase())
  @IsEnum(PAYMENT_TYPE)
  payment_type: PAYMENT_TYPE;

  @Type(() => OrderDetailDto)
  @ValidateNested({ each: true })
  order_details?: OrderDetailDto[];

  request_survey: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([0, 1])
  is_overdistance?: number;

  @Type(() => Number)
  additional_fee: number;

  @IsOptional()
  notes?:string;
}
