import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRegisterDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  role_id?: number

  //FIXME: CHECK THIS CODE 
  @ApiProperty()
  @IsOptional()
  vendor_id?: number;
  
  @ApiProperty()
  @IsOptional()
  @IsString()
  pic_name?: string;
  
  @ApiProperty()
  @IsOptional()
  @IsEmail()
  email?: string; 

  @ApiProperty()
  @IsOptional()
  nik?: string;

  @ApiProperty()
  @IsOptional()
  phone_number?: string;

  @ApiProperty()
  @IsOptional()
  whatsapp_number?: string;

  @ApiProperty()
  @IsOptional()
  birth?: string; 

  @ApiProperty()
  @IsOptional()
  store_id?: number;
}
