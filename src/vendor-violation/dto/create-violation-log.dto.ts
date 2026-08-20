import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsIn,
  IsNotEmpty,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateViolationLogDto {
  @ApiProperty({ description: 'Vendor ID that committed the violation', type: Number, example: 1 })
  @IsInt()
  vendor_id: number;

  @ApiProperty({ description: 'Violation Type ID from vendor_violation_type table', type: Number, example: 1 })
  @IsInt()
  violation_type_id: number;

  @ApiPropertyOptional({ description: 'Related Order ID (if violation is related to specific order)', type: Number })
  @IsOptional()
  @IsInt()
  order_id?: number;

  @ApiPropertyOptional({ description: 'Additional description or notes about the violation' })
  @IsOptional()
  @IsString()
  description?: string;

  // [POIN 6] evidence_path jadi WAJIB (Lapis 3 UI guard — sebelumnya optional).
  // CreateViolationLog() manual entry via UI → provenance otomatis MANUAL_UPLOAD
  // (di-set oleh service). Backend tidak terima dari FE lagi untuk kolom ini.
  @ApiProperty({
    description: 'Path ke bukti pelanggaran (foto/screenshot/file). WAJIB diisi.',
    example: '/uploads/evidence/refund-foto-12345.png',
  })
  @IsString()
  @IsNotEmpty({ message: 'evidence_path wajib diisi' })
  evidence_path: string;
}

export class QueryViolationLogDto {
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

  @ApiPropertyOptional({ description: 'Filter by Vendor ID', type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  vendor_id?: number;

  @ApiPropertyOptional({ description: 'Filter by Quarter (1-4)', type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  quarter?: number;

  @ApiPropertyOptional({ description: 'Filter by Year', type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  year?: number;

  @ApiPropertyOptional({ description: 'Filter by Violation Category (e.g., KONFIRMASI_ORDER, REFUND, LAINNYA)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Search by vendor, violation code/name, or project number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter violation logs from date (YYYY-MM-DD)', example: '2024-01-01' })
  @IsOptional()
  @IsString()
  date_from?: string;

  @ApiPropertyOptional({ description: 'Filter violation logs to date (YYYY-MM-DD)', example: '2024-12-31' })
  @IsOptional()
  @IsString()
  date_to?: string;
}

// Get vendor's current quarter points
export class GetVendorQuarterPointsDto {
  @ApiProperty({ description: 'Vendor ID to get points for', type: Number, example: 1 })
  @IsInt()
  vendor_id: number;

  @ApiPropertyOptional({ description: 'Quarter to check (1-4). If not provided, uses current quarter.', type: Number })
  @IsOptional()
  @IsInt()
  quarter?: number;

  @ApiPropertyOptional({ description: 'Year to check. If not provided, uses current year.', type: Number })
  @IsOptional()
  @IsInt()
  year?: number;
}

// Cross-field validation (date_from <= date_to) is enforced in the service
// layer; class-level decorators don't have access to multiple fields.
export class ExportViolationLogDto {
  @ApiPropertyOptional({
    description: 'Output format. Only "excel" is supported in v1.',
    enum: ['excel'],
    example: 'excel',
  })
  @IsOptional()
  @IsIn(['excel'])
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  format?: 'excel';

  @ApiPropertyOptional({ description: 'Filter by Vendor ID', type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  vendor_id?: number;

  @ApiPropertyOptional({ description: 'Filter by Quarter (1-4)', type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  @Transform(({ value }) => parseInt(value, 10))
  quarter?: number;

  @ApiPropertyOptional({ description: 'Filter by Year (>= 2000)', type: Number })
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2999)
  @Transform(({ value }) => parseInt(value, 10))
  year?: number;

  @ApiPropertyOptional({
    description: 'Filter by Violation Category (e.g., KONFIRMASI_ORDER, REFUND, LAINNYA)',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Search by vendor, violation code/name, or project number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter violation logs from date (YYYY-MM-DD)',
    example: '2024-01-01',
  })
  @IsOptional()
  @ValidateIf((o) => o.date_from !== undefined && o.date_from !== null)
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : value,
  )
  date_from?: string;

  @ApiPropertyOptional({
    description: 'Filter violation logs to date (YYYY-MM-DD)',
    example: '2024-12-31',
  })
  @IsOptional()
  @ValidateIf((o) => o.date_to !== undefined && o.date_to !== null)
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : value,
  )
  date_to?: string;
}
