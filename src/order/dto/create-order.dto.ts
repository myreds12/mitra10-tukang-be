import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PAYMENT_TYPE } from '../enum/payment_type.enum';
import { ApiBody, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEitherRequired } from '../decorator/is-either-required.decorator';

export class OrderDetailsDto {
  @Type(() => Number)
  @IsNumber()
  order_id: number;

  @Type(() => Number)
  @IsNumber()
  item_id: number;

  // @Type(() => Number)
  // @IsNumber()
  // order_status_id: number;

  // @IsString()
  // unit: string;

  // @Type(() => Number)
  // @IsNumber()
  // unit_price: number;

  // @Type(() => Number)
  // @IsNumber()
  // quote_price: number;

  @Type(() => Number)
  @IsNumber()
  quantity: number;

  // @Type(() => Number)
  // @IsNumber()
  // total: number;

  // @Type(() => Number)
  // @IsNumber()
  // survey_price: number;

  // @Type(() => Number)
  // @IsNumber()
  // comission: number;

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
  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  order_files: Array<Express.Multer.File>;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  member_id: number;

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

  @ApiProperty()
  @Type(() => Number)
  project_status_id?: number;

  @ApiProperty()
  receipt_number?: string;

  @ApiProperty({ enum: PAYMENT_TYPE })
  @Transform(({ value }) => value.toLocaleLowerCase())
  @IsEnum(PAYMENT_TYPE)
  payment_type: PAYMENT_TYPE;

  // @ApiProperty()
  // @Type(() => Number)
  // @IsNumber()
  // grand_total: number;

  // @ApiProperty()
  // @Type(() => Number)
  // @IsNumber()
  // grand_total_comission: number;

  // @ApiBody({
  //   type: [OrderDetailsDto],
  // })
  // @ApiProperty({
  //   type: () => [OrderDetailsDto],
  // }) // This represents an array of OrderDetailDto
  @Type(() => OrderDetailsDto)
  order_details?: OrderDetailsDto[];

  request_survey: string;
}
