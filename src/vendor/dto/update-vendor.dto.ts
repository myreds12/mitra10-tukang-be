import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class VendorBank {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  id: number;

  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  bank_id: number;



  account_name: string;
  account_number: string;
}

class VendorArea {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  id: number;

  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  area_id: number;

  @IsNotEmpty()
  default_discount: string;
  
  @IsNotEmpty()
  default_markup: string;
  
  default_unit?: string;
}

class VendorService {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  id?: number;

  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  service_type_id: number;
}

export class UpdateVendorDto {
  @ApiProperty()
  company_name?: string;

  address?: string;

  phone_number?: string;

  email_address?: string;

  join_date?: Date;

  area_id?: number;

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

  @ApiProperty({ type: VendorBank }) // This represents a VendorBank
  @Type(() => VendorBank)
  vendor_bank?: VendorBank;

  @ApiProperty({ type: [VendorArea] }) // This represents an array of VendorArea
  @Type(() => VendorArea)
  vendor_area?: VendorArea[];

  @ApiProperty({ type: [VendorService] }) // This represents an array of VendorService
  @Type(() => VendorService)
  vendor_service?: VendorService[];

  @Type(() => VendorStore)
  @ValidateNested({ each: true })
  vendor_store: VendorStore[]

  @IsOptional()
  @IsString()
  pic_name?: string;
}

class VendorStore{
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  id?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  store_id: number
}
