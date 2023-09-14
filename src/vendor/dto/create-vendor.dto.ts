import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsNotEmpty, IsString } from 'class-validator';

export class CreateVendorDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  company_name: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  phone_number: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  email_address: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsDate()
  join_date: Date;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  city_id?: number;
}
