import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { SalesBrandsDto } from './sales-brands.dto';
import { SalesCategoriesDto } from './sales-categories.dto';

export class UpdateSalesDto {
  @ApiProperty()
  @IsInt()
  @IsOptional()
  store_id?: number;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  user_id?: number;

  @ApiProperty()
  @IsString()
  @IsOptional()
  full_name?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  nik?: string;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  bank_id?: number;

  @ApiProperty()
  @IsString()
  @IsOptional()
  bank_branch?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  account_name?: string;

  @ApiProperty()
  sales_brands?: SalesBrandsDto[];

  @ApiProperty()
  sales_categories?: SalesCategoriesDto[];
}
