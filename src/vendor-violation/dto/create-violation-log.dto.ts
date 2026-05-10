import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  Min,
  Max,
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

  @ApiPropertyOptional({ description: 'File path to evidence (screenshot, photo, etc.)' })
  @IsOptional()
  @IsString()
  evidence_path?: string;
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