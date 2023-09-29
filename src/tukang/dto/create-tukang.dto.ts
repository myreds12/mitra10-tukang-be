import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTukangDto {
  @ApiProperty()
  @IsOptional()
  vendor_id?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ktp_number: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  join_date?: Date;

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
