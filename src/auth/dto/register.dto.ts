import { ApiProperty } from '@nestjs/swagger';
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
}
