import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional } from "class-validator";

export class RescheduleTukang { 
  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  id: number;
  
  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  tukang_id: number;
}