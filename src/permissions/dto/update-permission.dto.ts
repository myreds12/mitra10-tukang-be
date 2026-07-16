import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdatePermissionDto {
    @ApiProperty()
    @IsString()
    @IsOptional()
    name?: string;
}
