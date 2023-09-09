import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDecimal,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateVendorAreaDto {
  @ApiProperty()
  @IsInt()
  @IsOptional()
  vendor_id?: number;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  area_serve?: number;

  @ApiProperty()
  @IsDecimal()
  @IsNotEmpty()
  default_discount: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  default_markup: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  default_unit: string;
}
