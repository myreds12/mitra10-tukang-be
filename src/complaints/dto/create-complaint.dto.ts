import { ApiProperty } from "@nestjs/swagger";

export class CreateComplaintDto {
    @ApiProperty()
    order_id: number;
    description: string;
    complaint_channel: string;
    complaint_date: string;
    complaint_status: number;
}
