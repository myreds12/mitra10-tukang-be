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
import { ServiceType } from './service-type.class.interface';

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

  @ApiProperty({ type: [ServiceType] }) // This represents an array of VendorService
  @Type(() => ServiceType)
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
