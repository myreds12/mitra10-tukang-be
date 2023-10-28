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
  
  full_name: string;
  
  ktp_number: string;

  phone_number: string;

  address: string;
  
  email: string;

  username: string;

  password: string;

  @Type(() => Number)
  vendor_id?: number;

  @Type(() => Number)
  service_type_id: number[];

  join_date?: string;

  bod: string;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  tukang_document?: Express.Multer.File[] | Express.Multer.File;
  
  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  ktp_file?: Express.Multer.File[] | Express.Multer.File;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  npwp_file?: Express.Multer.File[] | Express.Multer.File;
}
