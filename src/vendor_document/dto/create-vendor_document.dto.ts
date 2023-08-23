import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateVendorDocumentDto {
    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    vendor_id: number;
}
