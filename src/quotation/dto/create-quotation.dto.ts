import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsNotEmpty, IsNumber, ValidateNested } from 'class-validator';
import { WorkOrderMaterialType } from 'src/work_orders/dto/work-order-material-type.enum';

class QuotationDetails {
  @Type(() => Number)
  item_id?: number;

  @Type(() => Number)
  work_order_item_id?: number;

  @Transform(({ value }) => Number(value))
  @IsEnum(WorkOrderMaterialType)
  type: WorkOrderMaterialType;

  name: string;

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

export class CreateQuotationDto {
  description: string;
  quotation_number: string;
  quotation_date: string;
  quotation_validity: string;
  quotation_disc: string;

  @Type(() => Number)
  order_id: number;

  @Type(() => Number)
  store_id: number;

  @Type(() => QuotationDetails)
  @ValidateNested({ each: true })
  quotation_details: QuotationDetails[];

  quotation_files: Express.Multer.File[];
}
