import { ApiProperty } from '@nestjs/swagger';

export class UpdateWorkOrderDto {
  @ApiProperty()
  order_id: number;
  vendor_id: number;
  tukang_id: number;
  request_work_time: string;
  survey_date: string;
  work_order_status: number;
  complaint_status: number;
  work_start_date: string;
  work_end_date: string;
  work_order_evidences: Array<Express.Multer.File>;
}
