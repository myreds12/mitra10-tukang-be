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
import { StatusDetails } from './work-order-status.dto';
import { UpdatedWorkOrderEvidences } from './update.work-order-evidences.dto';

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
  @IsOptional()
  @Type(() => WorkOrderTukang)
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
  @Transform(({ value }) => new Date(value))
  survey_date: string | Date;

  @IsNumber()
  @Type(() => Number)
  work_order_status: number;

  @IsOptional()
  @Transform(({ value }) => new Date(value))
  work_start_date: string;

  @IsOptional()
  @Transform(({ value }) => new Date(value))
  work_end_date: string;

  work_order_evidences?: Array<Express.Multer.File>;

  @ApiProperty({ type: [UpdatedWorkOrderEvidences] }) // This represents an array of VendorService
  @IsOptional()
  @Type(() => UpdatedWorkOrderEvidences)
  @ValidateNested({ each: true })
  existing_work_order_evidences: UpdatedWorkOrderEvidences[];
}
