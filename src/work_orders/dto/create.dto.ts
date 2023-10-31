import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber } from "class-validator";

class WorkOrderDetails {
    @ApiProperty({ type: Number })
    @Type(() => Number)
    @IsNumber()
    tukang_id: number
}
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
    @ApiProperty({ type: Number })
    @Type(() => Number)
    complaint_status: number;

    work_order_details: WorkOrderDetails[];
    request_work_time: string;
    survey_date: string;
    work_start_date: string;
    work_end_date: string;
    work_evidences?: Array<Express.Multer.File>;
}