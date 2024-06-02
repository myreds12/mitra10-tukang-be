import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsNotEmpty, ValidateNested } from "class-validator";
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

    @Type(() => PromotionStores)
    @ValidateNested({each: true})
    promotion_store: PromotionStores[];
}
