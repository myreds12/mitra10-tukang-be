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
  @IsNotEmpty()
  full_name: string;

  @IsOptional()
  // @IsEmail()
  // @IsNotEmpty()
  email: string;
  
  phone_number: string;
  
  whatsapp_number: string;
  
  address_1: string;
  
  address_2?: string;
  
  @IsOptional()
  @IsInt()
  area_id?: number;

  zip_code: string;

  rating?: number;

  join_date?: string;

  join_location?: number;

  // Other fields can be added here

  // You can add more validation decorators for created_by, updated_by, deleted_by if needed
}
