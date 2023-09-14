import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateSalesDto {
  @ApiProperty()
  @IsInt()
  @IsOptional()
  store_id?: number;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  user_id?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  nik: string;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  bank_id?: number;

  @ApiProperty()
  @IsString()
  @IsOptional()
  bank_branch?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  account_name?: string;
}
