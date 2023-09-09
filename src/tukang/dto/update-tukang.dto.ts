import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateTukangDto {
  @ApiProperty()
  @IsInt()
  @IsOptional()
  vendor_id?: number;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  user_id?: number;

  @ApiProperty()
  @IsString()
  @IsOptional()
  full_name?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  ktp_number?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty()
  @IsDateString()
  @IsOptional()
  join_date?: Date;
}
