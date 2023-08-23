import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber } from "class-validator";

export class CreateRoleMenuDto {
    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    role_id: number;

    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    menu_id: number;
}
