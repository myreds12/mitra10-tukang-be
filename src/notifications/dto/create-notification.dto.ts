import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsOptional } from "class-validator";

export class CreateNotificationDto {
    @IsOptional()
    // @Transform((value) => value.value.split(',').filter(Boolean).map(Number))
    @Type(() => Number)
    id?: number;
}
