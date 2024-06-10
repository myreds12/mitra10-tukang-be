import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  username?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  password?: string;


  //FIXME: CHECK THIS CODE 
  @ApiProperty()
  @IsOptional()
  id_pic: number;

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
