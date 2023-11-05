import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';

export class CreateMaterialDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  id: number;
  
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  item_id?: number;
  
  @Type(() => Number)
  @IsNumber()
  tukang_id?: number;

  price: string;
  
  @Type(() => Number)
  @IsNumber()
  quantity: number;
}
