import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { SalesBrandsDto } from './sales-brands.dto';
import { SalesCategoriesDto } from './sales-categories.dto';
import { Type } from 'class-transformer';

export class CreateSalesDto {
  @ApiProperty()
  @IsString()
  full_name: string;
  
  @ApiProperty()
  @IsString()
  @IsOptional()
  nik?: string;
  
  @ApiProperty()
  @IsInt()
  @IsOptional()
  store_id?: number;
  
  @IsOptional()
  bank_id?: number;
  
  @IsOptional()
  bank_branch?: string;
  
  @ApiProperty()
  @IsString()
  account_number: string;
  
  @ApiProperty()
  @IsString()
  phone_number: string;

  @IsOptional()
  account_name?: string;

  @IsString()
  sales_brand: string;

  @IsOptional()
  @Type(() => SalesBrandsDto)
  @ValidateNested({ each: true })
  sales_brands?: SalesBrandsDto[];

  @ApiProperty()
  @Type(() => SalesCategoriesDto)
  @ValidateNested({ each: true })
  sales_categories: SalesCategoriesDto[];
}
