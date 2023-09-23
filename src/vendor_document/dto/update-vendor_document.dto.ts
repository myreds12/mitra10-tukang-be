import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class UpdateVendorDocumentDto {
    @ApiProperty()
    @IsNumber()
    @IsOptional()
    vendor_id?: number;
}
