import { ApiProperty } from "@nestjs/swagger";

export class CreateQuotationDto {
    @ApiProperty()
    description: string;
    quotation_number: string;
    quotation_date: string;
    quotation_validity: string;
    complaint_status: number;
}
