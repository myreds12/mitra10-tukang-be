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

export class CreateSalesDto {
  full_name: string;
  nik?: string;
  
  @ApiProperty()
  @IsInt()
  @IsOptional()
  store_id?: number;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  user_id?: number;

  @IsOptional()
  bank_id?: number;

  @IsOptional()
  bank_branch?: string;

  @IsOptional()
  account_name?: string;

  @ApiProperty()
  sales_brands: SalesBrandsDto[];

  @ApiProperty()
  sales_categories: SalesCategoriesDto[];
}
