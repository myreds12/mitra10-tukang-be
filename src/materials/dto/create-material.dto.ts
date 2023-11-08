import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, isNumber } from 'class-validator';

export class CreateMaterialDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  id?: number;

  @IsNumber()
  @Type(() => Number)
  item_id?: number | null;
  item_name: string;

  @IsNumber()
  @Type(() => Number)
  tukang_id?: number | null;
  tukang_name: string;

  price: string;

  @Type(() => Number)
  @IsNumber()
  quantity: number;
}
