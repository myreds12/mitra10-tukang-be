import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

import { Type } from 'class-transformer';

export class UpdateManagerDto {
  @ApiProperty()
  @IsInt()
  @IsOptional()
  store_id?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  is_active?: number;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  bank_id?: number;

  @ApiProperty()
  @IsString()
  @IsOptional()
  full_name?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  nik?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  bank_branch?: string;

  @ApiProperty()
  @IsString()
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
  username?: string;

  @IsOptional()
  @IsString()
  password: string;
}
