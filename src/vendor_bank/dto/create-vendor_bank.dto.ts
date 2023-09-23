import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber } from "class-validator";

export class CreateVendorBankDto {
    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    bank_id: number;

    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    vendor_id: number;

    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    account_name: string;
}
