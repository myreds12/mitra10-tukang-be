import {
  IsInt,
  IsOptional,
  IsString,
  IsEmail,
  IsNotEmpty,
  IsPhoneNumber,
  IsDate,
} from 'class-validator';

export class CreateMemberDto {
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @IsString()
  @IsNotEmpty()
  whatsapp_number: string;

  @IsString()
  @IsNotEmpty()
  address_1: string;

  @IsString()
  @IsOptional()
  address_2?: string;

  @IsInt()
  @IsOptional()
  city_id?: number;

  @IsString()
  @IsNotEmpty()
  zip_code: string;

  rating?: number;

  join_date: string;

  @IsInt()
  join_location: number;

  // Other fields can be added here

  // You can add more validation decorators for created_by, updated_by, deleted_by if needed
}
