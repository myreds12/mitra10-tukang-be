import { Transform, Type } from 'class-transformer';
import { IsOptional, ValidateIf } from 'class-validator';
import { WorkOrderMaterialType } from 'src/work_orders/dto/work-order-material-type.enum';
import { MarginType } from './margin-type.enum';
import { BadRequestException } from '@nestjs/common';

export default class QuotationDetails {
  @Type(() => Number)
  id?: number;

  @Type(() => Number)
  item_id?: number;

  @Type(() => Number)
  @ValidateIf(
    (object: QuotationDetails, value: number | undefined | null) =>
      object.type === WorkOrderMaterialType.MATERIAL && Boolean(value),
    {
      message: 'category_id is required when type is 2 or MATERIAL',
    },
  )
  category_id?: number;

  @Type(() => Number)
  work_order_item_id?: number;

  @Transform(({ value }) => Number(value))
  // @IsEnum(WorkOrderMaterialType)
  type: WorkOrderMaterialType;

  description?: string;

  name: string;
  unit: string;

  @Transform(({ value }) => {
    if (typeof value === 'string' && value.includes(',')) {
      throw new BadRequestException('Harga tidak boleh menggunakan koma. Gunakan titik sebagai pemisah desimal.');
    }
    return parseFloat(value); // atau Number(value)
  })
  price: string | number;

  @Transform(({ value }) => {
    if (typeof value === 'string' && value.includes(',')) {
      throw new BadRequestException('Harga tidak boleh menggunakan koma. Gunakan titik sebagai pemisah desimal.');
    }
    return parseFloat(value); // atau Number(value)
  })
  margin: string | number;

  @Transform(({ value }) => Number(value))
  // @IsEnum(MarginType)
  margin_type: MarginType;

  @Type(() => Number)
  quantity: number;

  @Type(() => Number)
  work_step: number;

  @IsOptional()
  @Type(() => Number)
  // @IsIn([0, 1])
  is_customer: number;
}
