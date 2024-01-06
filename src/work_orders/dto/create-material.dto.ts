import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { WorkOrderMaterialType } from './work-order-material-type.enum';

export class CreateMaterialDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  id?: number;

  @Transform(({ value }) => Number.parseInt(value))
  @IsOptional()
  item_id?: number;

  @IsOptional()
  item_name?: string;

  @Transform(({ value }) => Number.parseInt(value))
  @IsOptional()
  quantity?: number;

  @IsOptional()
  unit?: string;

  @Type(() => Number)
  @IsOptional()
  tukang_id?: number | null;

  @IsOptional()
  tukang_name?: string;

  @Transform(({ value }) => Number(value))
  @IsEnum(WorkOrderMaterialType)
  type: WorkOrderMaterialType;

  @IsNotEmpty()
  @Type(() => Number)
  @IsIn([0, 1])
  is_customer: number;
}
