import { ApiProperty } from "@nestjs/swagger";

export class CreateInvoiceDto {
    @ApiProperty()
    order_id: number;
    request_work_time: string;
    survey_date: string;
    work_start_date: string;
    work_end_date: string;
}
