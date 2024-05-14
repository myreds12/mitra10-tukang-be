import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
// import { SalesBrandsDto } from './sales-brands.dto';
import { SalesCategoriesDto } from './sales-categories.dto';
import { Type } from 'class-transformer';
import { IsUsernameValid } from './is-username-valid.decorator';

export class CreateSalesDto {
  @ApiProperty()
  @IsInt()
  @IsOptional()
  store_id?: number;

  @IsOptional()
  bank_id?: number;

  @ApiProperty()
  @IsString()
  full_name: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  nik?: string;

  @IsOptional()
  bank_branch?: string;

  @IsOptional()
  account_name?: string;

  @IsOptional()
  @IsString()
  account_number: string;

  @IsOptional()
  @IsString()
  phone_number: string;

  @IsOptional()
  @IsString()
  // @IsUsernameValid()
  username: string;

  @IsOptional()
  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  sales_brand: string;

  @IsOptional()
  @Type(() => SalesCategoriesDto)
  @ValidateNested({ each: true })
  sales_categories: SalesCategoriesDto[];
}
