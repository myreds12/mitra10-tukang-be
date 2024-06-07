import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsNotEmpty, ValidateNested } from "class-validator";
import { PromotionType } from "./promotion-type.enum";
import { PromotionStores } from "./promotion-store.dto";

export class CreatePromotionDto {
    @ApiProperty()
    @Type(() => Number)
    @IsNotEmpty()
    min_order: number  
    
    @ApiProperty()
    @Type(() => Number)
    @IsNotEmpty()
    promotion: number

    @ApiProperty()
    @IsEnum(PromotionType)
    promotion_type: PromotionType

    @IsDateString()
    start_date: string

    @IsDateString()
    end_date: string

    @Type(() => PromotionStores)
    @ValidateNested({each: true})
    promotion_store: PromotionStores[];
}
