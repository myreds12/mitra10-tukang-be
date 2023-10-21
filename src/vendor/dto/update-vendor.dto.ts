import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  ktp_file?: Array<Express.Multer.File> | Express.Multer.File;

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
