import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber } from "class-validator";

export class CreateUserMenuPermissionDto {
    @ApiProperty()
    @IsNumber()
    @IsNotEmpty()
    menu_id: number;

}
