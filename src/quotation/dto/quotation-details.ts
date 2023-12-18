import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsNotEmpty, ValidateIf } from 'class-validator';
import { WorkOrderMaterialType } from 'src/work_orders/dto/work-order-material-type.enum';

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
  @IsEnum(WorkOrderMaterialType)
  type: WorkOrderMaterialType;

  description?: string;

  name: string;
  unit: string;

  @Transform(({ value }) => Number(value))
  price: string | number;

  @Transform(({ value }) => Number(value))
  margin: string | number;

  @Type(() => Number)
  quantity: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsIn([0, 1])
  is_customer: number;
}
