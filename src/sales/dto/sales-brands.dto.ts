import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

export class SalesBrandsDto {
  @ApiProperty()
  @Type(() => Number)
  @IsOptional()
  id?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  brands_id: number;
}
