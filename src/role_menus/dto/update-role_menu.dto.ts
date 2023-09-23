import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional } from "class-validator";

export class UpdateRoleMenuDto {
    @ApiProperty()
    @IsNumber()
    @IsOptional()
    role_id?: number;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    menu_id?: number;
}
