import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { WorkOrderTukang } from './wo-tukang.dto';
import { WorkOrderMaterialType } from './work-order-material-type.enum';
// import { CreateMaterialDto } from 'src/materials/dto/create-material.dto';

class CreateMaterialDto {
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  id?: number;

  @Transform(({ value }) => Number.parseInt(value))
  @IsOptional()
  item_id?: number;
  @IsOptional()
  item_name?: string;

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

class StatusDetails {
  @ApiProperty()
  @IsOptional()
  @Transform(({ value }) => new Date(value))
  work_date_time?: string;

  @IsString()
  @IsOptional()
  time_spent?: string;

  @IsOptional()
  description?: string;

  @ApiProperty({ type: CreateMaterialDto })
  @Type(() => CreateMaterialDto)
  @ValidateNested({ each: true })
  work_order_items?: Array<CreateMaterialDto>;
}

export class UpdateWorkOrderDto {
  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  order_id?: number;

  @Type(() => Number)
  @IsOptional()
  vendor_id?: number;

  @ApiProperty({ type: [WorkOrderTukang] }) // This represents an array of VendorService
  @Type(() => WorkOrderTukang)
  @IsOptional()
  @ValidateNested({ each: true })
  work_order_tukang?: WorkOrderTukang[];

  @Type(() => StatusDetails)
  @ValidateNested({ each: true })
  status_details: StatusDetails;

  // @IsNotEmpty()
  @IsString()
  @IsOptional()
  request_work_time: string;

  // @IsNotEmpty()
  // @IsString()
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => new Date(value))
  survey_date: string | Date;

  @IsNumber()
  @Type(() => Number)
  work_order_status: number;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => new Date(value))
  work_start_date: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => new Date(value))
  work_end_date: string;

  work_order_evidences?: Array<Express.Multer.File>;
}
