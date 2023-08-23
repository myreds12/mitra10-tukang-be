import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional } from "class-validator";

export class UpdateVendorBankDto {
    @ApiProperty()
    @IsNumber()
    @IsOptional()
    bank_id?: number;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    vendor_id?: number;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    account_name?: string;
}
