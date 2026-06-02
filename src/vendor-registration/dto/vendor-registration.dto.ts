import {
  IsString,
  IsOptional,
  IsEmail,
  IsInt,
  IsArray,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TukangRegistrationDto {
  @ApiProperty({ description: 'Tukang name', example: 'Tukang A' })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiProperty({ description: 'Tukang phone number', example: '081234567890' })
  @IsOptional()
  @IsString()
  phone_number?: string;

  @ApiProperty({ description: 'Tukang KTP number', example: '3201234567890001' })
  @IsOptional()
  @IsString()
  ktp_number?: string;

  @ApiProperty({ description: 'Tukang skill/service type id or name', example: 1 })
  @IsOptional()
  skill?: string | number;

  @ApiProperty({ description: 'Tukang name alias', example: 'Tukang A' })
  @IsOptional()
  @IsString()
  nama?: string;

  @ApiProperty({ description: 'Tukang phone number alias', example: '081234567890' })
  @IsOptional()
  @IsString()
  no_hp?: string;

  @ApiProperty({ description: 'Tukang KTP number alias', example: '3201234567890001' })
  @IsOptional()
  @IsString()
  no_ktp?: string;

  @ApiProperty({ description: 'Tukang skill alias', example: 1 })
  @IsOptional()
  keahlian?: string | number;

  @ApiProperty({ description: 'Tukang service type id', example: 1 })
  @IsOptional()
  service_type_id?: string | number;
}

export class RegisterVendorDto {
  @ApiProperty({ description: 'Company name', example: 'CV. Pasang Lantai Jaya' })
  @IsString()
  company_name: string;

  @ApiProperty({ description: 'Company address', example: 'Jl. Veteran No. 10, Jakarta' })
  @IsString()
  address: string;

  @ApiProperty({ description: 'Company phone number', example: '081234567890' })
  @IsString()
  phone_number: string;

  @ApiProperty({ description: 'Company email address', example: 'vendor@email.com' })
  @IsEmail()
  email_address: string;

  @ApiProperty({ description: 'Person in Charge name', example: 'Budi Santoso' })
  @IsString()
  pic_name: string;

  @ApiProperty({ description: 'PIC email address', example: 'pic@email.com' })
  @IsEmail()
  pic_email: string;

  @ApiProperty({ description: 'PIC phone number', example: '081234567890' })
  @IsString()
  pic_phone: string;

  @ApiPropertyOptional({ description: 'KTP number of PIC', example: '3201234567890001' })
  @IsOptional()
  @IsString()
  ktp_number?: string;

  @ApiPropertyOptional({ description: 'NPWP number of company', example: '012345678901234' })
  @IsOptional()
  @IsString()
  npwp_number?: string;

  @ApiPropertyOptional({ description: 'Bank ID for payment', type: Number, example: 1 })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return parseInt(value, 10);
  })
  bank_id?: number;

  @ApiPropertyOptional({ description: 'Array of service type IDs that vendor can provide', type: [Number], example: [1, 2, 3] })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => parseInt(v, 10));
        }
        return [parseInt(value, 10)];
      } catch {
        return [parseInt(value, 10)];
      }
    }
    if (Array.isArray(value)) {
      return value.map((v) => parseInt(v, 10));
    }
    return value;
  })
  service_types?: number[];

  @ApiPropertyOptional({ description: 'Array of area IDs where vendor operates', type: [Number], example: [1, 2] })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => parseInt(v, 10));
        }
        return [parseInt(value, 10)];
      } catch {
        return [parseInt(value, 10)];
      }
    }
    if (Array.isArray(value)) {
      return value.map((v) => parseInt(v, 10));
    }
    return value;
  })
  areas?: number[];

  @ApiPropertyOptional({ description: 'Additional notes or comments' })
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Array of tukang objects to be registered with this vendor', type: [TukangRegistrationDto] })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TukangRegistrationDto)
  tukang_data?: TukangRegistrationDto[];
}

export class QueryVendorRegistrationDto {
  @ApiPropertyOptional({ description: 'Page number for pagination', default: 1, type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of records per page', default: 10, type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  take?: number = 10;

  @ApiPropertyOptional({ description: 'Filter by status (1=Menunggu Approve, 2=Proses Pitching, 3=Disetujui, 4=Ditolak)', type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  status?: number;

  @ApiPropertyOptional({ description: 'Search by company name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter registration date from (YYYY-MM-DD)', example: '2024-01-01' })
  @IsOptional()
  @IsString()
  date_from?: string;

  @ApiPropertyOptional({ description: 'Filter registration date to (YYYY-MM-DD)', example: '2024-12-31' })
  @IsOptional()
  @IsString()
  date_to?: string;
}

export class ApproveVendorRegistrationDto {
  @ApiPropertyOptional({ description: 'Array of store IDs assigned to this vendor', type: [Number], example: [1, 2] })
  @IsOptional()
  @IsInt()
  vendor_store?: number[];

  @ApiPropertyOptional({ description: 'Maximum number of concurrent orders for this vendor', type: Number, example: 5 })
  @IsOptional()
  @IsInt()
  max_order?: number;

  @ApiPropertyOptional({ description: 'Approval notes or conditions' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectVendorRegistrationDto {
  @ApiPropertyOptional({ description: 'Reason for rejecting the registration', example: 'Incomplete documents submitted' })
  @IsOptional()
  @IsString()
  rejection_reason?: string;

  @ApiPropertyOptional({ description: 'Additional rejection notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ValidateTokenDto {
  @ApiProperty({ description: 'Registration token sent via email', example: 'abc123def456ghi789' })
  @IsString()
  token: string;
}

export class CreateUserFromTokenDto {
  @ApiProperty({ description: 'Username for the new vendor user', example: 'vendor_owner_new' })
  @IsString()
  username: string;

  @ApiProperty({ description: 'Password for the new vendor user (min 6 characters)', example: 'securePassword123' })
  @IsString()
  @MinLength(6, { message: 'Password harus memiliki minimal 6 karakter' })
  password: string;
}
