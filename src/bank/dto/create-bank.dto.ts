import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CreateBankDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    bank_name: string

}
