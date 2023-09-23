import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional } from "class-validator";

export class UpdateUserMenuPermissionDto {
    @ApiProperty()
    @IsNumber()
    @IsOptional()
    menu_id?: number;

}
