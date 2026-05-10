import {
  IsInt,
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QueryVendorSpDto {
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

  @ApiPropertyOptional({ description: 'Filter by vendor ID', type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  vendor_id?: number;

  @ApiPropertyOptional({ description: 'Filter by SP level (1, 2, or 3)', type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  sp_level?: number;

  @ApiPropertyOptional({ description: 'Filter by SP status (0=Inactive, 1=Active)', type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  status?: number;

  @ApiPropertyOptional({ description: 'Filter by quarter (1-4)', type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  quarter?: number;

  @ApiPropertyOptional({ description: 'Filter by year (e.g., 2024)', type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  year?: number;

  @ApiPropertyOptional({ description: 'Filter SP start date from (YYYY-MM-DD)', example: '2024-01-01' })
  @IsOptional()
  @IsString()
  date_from?: string;

  @ApiPropertyOptional({ description: 'Filter SP start date to (YYYY-MM-DD)', example: '2024-12-31' })
  @IsOptional()
  @IsString()
  date_to?: string;

  @ApiPropertyOptional({ description: 'Search by vendor name or company name' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateVendorSpDto {
  @ApiProperty({ description: 'Vendor ID that will receive the SP', type: Number, example: 1 })
  @IsInt()
  vendor_id: number;

  @ApiProperty({ description: 'SP Level (1, 2, or 3)', type: Number, example: 1 })
  @IsInt()
  sp_level: number;

  @ApiProperty({ description: 'Total violation points accumulated', type: Number, example: 5 })
  @IsInt()
  total_point: number;

  @ApiProperty({ description: 'Quarter when SP is issued (1-4)', type: Number, example: 1 })
  @IsInt()
  quarter: number;

  @ApiProperty({ description: 'Year when SP is issued', type: Number, example: 2024 })
  @IsInt()
  year: number;

  @ApiPropertyOptional({ description: 'SP start date (YYYY-MM-DD)', example: '2024-01-15' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'SP end date (YYYY-MM-DD)', example: '2024-04-15' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ description: 'Additional notes for this SP' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Order allocation reduction percentage (0-100)', type: Number, example: 50 })
  @IsOptional()
  @IsInt()
  allocation_reduction?: number;
}

export class UpdateVendorSpDto {
  @ApiPropertyOptional({ description: 'SP status (0=Inactive, 1=Active, 2=Completed)', type: Number })
  @IsOptional()
  @IsInt()
  status?: number;

  @ApiPropertyOptional({ description: 'Order allocation reduction percentage (0-100)', type: Number, example: 75 })
  @IsOptional()
  @IsInt()
  allocation_reduction?: number;

  @ApiPropertyOptional({ description: 'New SP end date (YYYY-MM-DD)', example: '2024-06-15' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ description: 'Additional notes or reason for update' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReactivateVendorDto {
  @ApiProperty({ description: 'Vendor ID to reactivate', type: Number, example: 1 })
  @IsInt()
  vendor_id: number;

  @ApiPropertyOptional({ description: 'Previous SP ID that was active before reactivation', type: Number })
  @IsOptional()
  @IsInt()
  previous_sp_id?: number;

  @ApiProperty({ description: 'Reason for reactivation', example: 'Vendor has shown improvement after SP3 period' })
  @IsString()
  reason: string;
}

export class CheckVendorSpDto {
  @ApiProperty({ description: 'Vendor ID to check SP status', type: Number, example: 1 })
  @IsInt()
  vendor_id: number;

  @ApiPropertyOptional({ description: 'Optional order ID to check specific violation', type: String })
  @IsOptional()
  @IsString()
  order_id?: string;
}