import { IsNotEmpty, IsString, IsInt, IsOptional } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  store_name: string;

  @IsOptional()
  store_group_id?: number;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsInt()
  city_id: number;

  @IsString()
  @IsNotEmpty()
  zip_code: string;

  @IsOptional()
  @IsString()
  additional_address: string;

  @IsString()
  @IsNotEmpty()
  phone_number_1: string;

  @IsString()
  @IsOptional()
  phone_number_2: string;

  @IsString()
  @IsNotEmpty()
  bank_account: string;

  @IsString()
  @IsNotEmpty()
  bank_name: string;

  @IsString()
  @IsNotEmpty()
  bank_number: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  default_password?: string;
}
