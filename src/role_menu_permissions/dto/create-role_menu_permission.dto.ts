import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber } from "class-validator";

export class CreateRoleMenuPermissionDto {
    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    role_menu_id: number;

    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    permission_id: number;

}
