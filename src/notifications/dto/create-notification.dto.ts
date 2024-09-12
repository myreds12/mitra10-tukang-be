import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsOptional } from "class-validator";

export class CreateNotificationDto {
    @IsOptional()
    @Type(() => Number)
    id?: number;

    @IsOptional()
    @Type(() => Number)
    check_all?: number;
    
    @IsOptional()
    @Type(() => Number)
    is_read?: number
}
