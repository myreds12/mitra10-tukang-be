import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateTukangDto {
  @ApiProperty()
  full_name?: string;

  ktp_number?: string;

  phone_number?: string;

  address?: string;

  email?: string;

  username?: string;

  password?: string;

  @Type(() => Number)
  vendor_id?: number;

  service_types?: ServiceType[];

  join_date?: string;

  bod?: string;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  ktp_file?: Express.Multer.File[] | Express.Multer.File;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  npwp_file?: Express.Multer.File[] | Express.Multer.File;
}

class ServiceType {
  @Type(() => Number)
  @IsOptional()
  id: number;

  @Type(() => Number)
  @IsNumber()
  service_type_id: number;
}
