import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { WorkOrderTukang } from './wo-tukang.dto';
import { Session } from '../enum/session.enum';

export class CreateWorkOrderDto {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  order_id: number;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  vendor_id: number;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  work_order_status: number;

  // @ApiProperty({ type: Number })
  // @Type(() => Number)
  // complaint_status: number;
  @ApiProperty({ type: [WorkOrderTukang] }) // This represents an array of VendorService
  @Type(() => WorkOrderTukang)
  @IsNotEmpty()
  @ValidateNested({ each: true })
  work_order_tukang: WorkOrderTukang[];

  @IsOptional()
  @ApiProperty({ type: Number })
  @Type(() => Number)
  // @IsEnum(Session)
  session?: Session;

  request_work_time: string;
  survey_date: string;
  work_start_date: string;
  work_end_date: string;
  work_order_evidences?: Array<Express.Multer.File>;
}
