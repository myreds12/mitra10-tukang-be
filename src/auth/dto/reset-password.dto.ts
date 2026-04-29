import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ResetPasswordDto {
    @ApiProperty()
    @IsOptional()
    @IsString()
    password?: string;
}