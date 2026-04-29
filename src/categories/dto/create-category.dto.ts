import { ApiProperty } from "@nestjs/swagger";

export class CreateCategoryDto {
    @ApiProperty()
    category_name: string;
}
