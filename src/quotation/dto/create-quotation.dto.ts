import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateQuotationDto {
    @ApiProperty()
    description: string;
    quotation_number: string;
    quotation_date: string;
    quotation_validity: string;
    
    @Type(() => Number)
    order_id: number

    @Type(() => Number)
    store_id: number
    
    @Type(() => Number)
    quotation_status: number

    quotaion_files: Express.Multer.File[]
}
