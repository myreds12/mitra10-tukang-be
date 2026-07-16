import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional } from "class-validator";

export class OrderFollowUpDto {
    @ApiProperty()
    @IsOptional()
    @Type(() => Number)
    id: number;

    @ApiProperty()
    @IsOptional()
    @Type(() => Number)
    order_id: number;

    @ApiProperty()
    @IsOptional()
    @Type(() => Number)
    csi_survey: number;

    @ApiProperty()
    @IsOptional()
    @Type(() => Number)
    csi_work: number;

    @ApiProperty()
    @IsOptional()
    description: string;

}