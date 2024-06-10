import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber } from "class-validator";

export class TukangAreaDto {
    @ApiProperty()
    @Type(() => Number)
    @IsNumber()
    id?: number

    @ApiProperty()
    @Type(() => Number)
    @IsNumber()
    area_id?: number;
}