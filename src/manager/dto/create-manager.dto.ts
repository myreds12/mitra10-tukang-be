import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CreateManagerDto {
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
}
