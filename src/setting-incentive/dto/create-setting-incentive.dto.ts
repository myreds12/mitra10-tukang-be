import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CreateSettingIncentiveDto {
    @ApiProperty()
    @Type(() => Number)
    min_order: number;
    
    @ApiProperty()
    @Type(() => Number)
    incentive: number;
    
}
