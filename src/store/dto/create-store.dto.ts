import { IsNotEmpty, IsString, IsInt, IsOptional } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  store_name: string;

  default_username?: string;

  @IsOptional()
  store_group_id?: number;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsInt()
  area_id: number;

  // @IsString()
  @IsOptional()
  zip_code: string;

  @IsOptional()
  // @IsString()
  additional_address: string;

  // @IsString()
  @IsOptional()
  phone_number_1: string;

  // @IsString()
  @IsOptional()
  phone_number_2: string;

  // @IsString()
  @IsOptional()
  bank_account: string;

  // @IsString()
  @IsOptional()
  bank_name: string;

  // @IsString()
  @IsOptional()
  bank_number: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  default_password?: string;
}
