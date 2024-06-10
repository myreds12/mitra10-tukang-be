import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional } from "class-validator";

export class PromotionStores {
    @ApiProperty()
    @IsOptional()
    @Type(() => Number)
    id?: number
    
    @ApiProperty()
    @Type(() => Number)
    store_id: number
}