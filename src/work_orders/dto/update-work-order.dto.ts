import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { WorkOrderTukang } from './wo-tukang.dto';
// import { CreateMaterialDto } from 'src/materials/dto/create-material.dto';

class CreateMaterialDto {
  @Type(() => Number)
  @IsNumber()
  id?: number;

  @Transform(({ value }) => Number.parseInt(value))
  item_id?: number;
  item_name?: string;

  @Type(() => Number)
  tukang_id?: number | null;
  tukang_name?: string;

  @Type(() => Number)
  @IsIn([1, 2])
  @IsNumber()
  type: number;
}

class StatusDetails {
  @ApiProperty()
  @IsDateString()
  @Transform(({ value }) => new Date(value))
  work_date_time?: string;

  @IsDateString()
  @Transform(({ value }) => new Date(value))
  time_spent?: string;

  description?: string;

  @ApiProperty({ type: CreateMaterialDto })
  @Type(() => CreateMaterialDto)
  @ValidateNested({ each: true })
  work_order_materials?: Array<CreateMaterialDto>;
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

  @IsDateString()
  @Transform(({ value }) => new Date(value))
  work_start_date: string;

  @IsDateString()
  @Transform(({ value }) => new Date(value))
  work_end_date: string;

  work_order_evidences?: Array<Express.Multer.File>;
}
