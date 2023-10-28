import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateVendorDto {
  @ApiProperty()
  company_name?: string;

  address?: string;

  phone_number?: string;

  email_address?: string;

  join_date?: Date;

  city_id?: number;

  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  vendor_document: Array<Express.Multer.File>;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  npwp_file?: Array<Express.Multer.File> | Express.Multer.File;

  npwp_number?: string;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  ktp_file?: Array<Express.Multer.File> | Express.Multer.File;

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

  vendor_bank?: VendorBank[];

  vendor_area?: VendorArea[];

  vendor_service?: VendorService[]; 
}

class VendorBank{
  id: number;

  @Type(() => Number)
  bank_id: number;

}

class VendorArea {
  id: number;

  @Type(() => Number)
  city_id: number;

  default_discount: string;
  default_markup: string;
  default_unit?: string;
}

class VendorService{
  id: number;

  @Type(() => Number)
  service_type_id: number
}
