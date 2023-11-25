import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateVendorDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  company_name: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  address: string;

  @IsString()
  phone_number: string;

  @IsEmail()
  email_address: string;

  @IsOptional()
  join_date?: string;

  @IsOptional()
  @ApiProperty({ type: [Number] })
  @Type(() => Number)
  city_id?: number[];

  @IsOptional()
  @ApiProperty({ type: [Number] })
  @Type(() => Number)
  service_type_id?: number[];

  @Type(() => Number)
  bank_id: number;

  @IsString()
  pic_name: string;
  
  @IsString()
  markup: string;
  
  @IsString()
  discount: string;

  @IsString()
  account_name: string;

  @IsString()
  account_number: string;

  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  vendor_document: Array<Express.Multer.File>;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  npwp_file?: Array<Express.Multer.File> | Express.Multer.File;

  @IsString()
  npwp_number?: string;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  ktp_file?: Array<Express.Multer.File> | Express.Multer.File;

  @IsString()
  ktp_number?: string;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  compro_file?: Array<Express.Multer.File> | Express.Multer.File;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  surat_permohonan_file?: Array<Express.Multer.File> | Express.Multer.File;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  pks_file?: Array<Express.Multer.File> | Express.Multer.File;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  suip_file?: Array<Express.Multer.File> | Express.Multer.File;
}
