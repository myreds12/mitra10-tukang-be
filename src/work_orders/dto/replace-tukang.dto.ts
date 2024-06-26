import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsOptional, IsString, ValidateNested } from "class-validator";
import { WorkOrderTukang } from "./wo-tukang.dto";
import { ReplaceTukangStatus } from "../enum/replace-tukang.enum";

export class ReplaceTukangDto {
    @ApiProperty()
    @IsOptional()
    @Type(() => Number)
    id?: number

    @ApiProperty()
    @IsOptional()
    @Type(() => Number)
    // @IsIn([ReplaceTukangStatus])
    status: ReplaceTukangStatus
    
    @ApiProperty()
    @IsOptional()
    @Type(() => Number)
    tukang_id?: number
    
    @ApiProperty()
    @IsOptional()
    @IsString()
    notes?: string;
}