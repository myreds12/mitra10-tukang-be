import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional } from "class-validator";

export class UpdateRoleMenuPermissionDto {
    @ApiProperty()
    @IsNumber()
    @IsOptional()
    role_menu_id?: number;

    @ApiProperty()
    @IsNumber()
    @IsOptional()
    permission_id?: number;

}
