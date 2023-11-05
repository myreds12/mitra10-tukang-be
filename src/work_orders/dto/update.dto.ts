import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { WorkOrderTukang } from './wo-tukang.dto';
import { CreateMaterialDto } from 'src/materials/dto/create-material.dto';

class StatusDetails {
  @ApiProperty()
  work_date_time: string;
  time_spent: string;
  work_order_materials?: CreateMaterialDto[];
}

export class UpdateWorkOrderDto {
  @ApiProperty()
  // @IsNumber()
  @Type(() => Number)
  order_id?: number;
  
  @Type(() => Number)
  vendor_id?: number;

  
  @ApiProperty({ type: [WorkOrderTukang] }) // This represents an array of VendorService
  @Type(() => WorkOrderTukang)
  @IsOptional()
  work_order_tukang?: WorkOrderTukang[];
  
  // TODO: TOLONG KASIH DECORATOR YA ALIF
  // @ApiProperty()
  status_details: StatusDetails
  
  // @ApiProperty()
  // @IsNotEmpty()
  // @IsString()
  request_work_time: string;

  // @ApiProperty()
  // @IsNotEmpty()
  // @IsString()
  survey_date: string;

  // @ApiProperty()
  // @IsNotEmpty()
  // @IsInt()
  work_order_status: number;

  // @ApiProperty()
  // @IsNotEmpty()
  // @IsString()
  work_start_date: string;

  // @ApiProperty()
  // @IsNotEmpty()
  // @IsString()
  work_end_date: string;

  // @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  // @IsNotEmpty()
  work_order_evidences?: Array<Express.Multer.File>;
}
