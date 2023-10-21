import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
  @Type(() => Number)
  vendor_id?: number;

  full_name: string;

  ktp_number: string;

  email: string;

  join_date?: Date;

  file: Express.Multer.File;
}
