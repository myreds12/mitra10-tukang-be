import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';
import { WorkOrderTukang } from './wo-tukang.dto';
// import { CreateMaterialDto } from 'src/materials/dto/create-material.dto';

class CreateMaterialDto {
  @Type(() => Number)
  @IsNumber()
  id?: number;

  @Transform(({ value }) => {
    console.log('DTO', value);

    return Number.parseInt(value);
  })
  item_id: number;
  item_name: string;

  @Type(() => Number)
  tukang_id?: number | null;
  tukang_name: string;

  price: string;

  @IsNumber()
  @Type(() => Number)
  quantity: number;
}

class StatusDetails {
  @ApiProperty()
  work_date_time: string;
  time_spent: string;
  description: string;

  @ApiProperty({ type: CreateMaterialDto }) // This represents an array of OrderDetailDto
  @Type(() => CreateMaterialDto)
  work_order_materials?: Array<CreateMaterialDto>;
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
  @Type(() => StatusDetails)
  status_details: StatusDetails;

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
  @Type(() => Number)
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
