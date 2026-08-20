import {
  IsInt,
  IsOptional,
  IsString,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO untuk filter/sort GET /vendor-sp/reactivation.
 *
 * Filter:
 * - search: nama perusahaan / PIC (case-insensitive contains)
 * - status: 1=PENDING, 2=APPROVED, 3=REJECTED
 * - date_from/date_to: filter reactivation request created_at (YYYY-MM-DD)
 *
 * [TIDAK di-include] sp3_date_from/sp3_date_to — lihat catatan TODO di schema:
 * `vendor_reactivation_log` punya `previous_sp_id` (Int?) tapi tidak ada
 * relation `previous_sp` di schema.prisma. Untuk filter by SP3 start_date
 * butuh join ke vendor_sp.start_date, yang butuh relation field.
 * Eksplisit di-skip per instruksi user (perubahan > sekadar filter).
 *
 * Pagination: max take=100, default 10.
 */
export class QueryReactivationLogDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Records per page (max 100)',
    default: 10,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  take?: number = 10;

  @ApiPropertyOptional({
    description:
      'Search by vendor company name OR PIC name (case-insensitive contains)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by reactivation status',
    enum: [1, 2, 3],
    enumName: 'ReactivationStatus',
  })
  @IsOptional()
  @IsIn([1, 2, 3])
  @Transform(({ value }) => parseInt(value, 10))
  status?: number;

  @ApiPropertyOptional({
    description: 'Filter reactivation request created_at from (YYYY-MM-DD)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsString()
  date_from?: string;

  @ApiPropertyOptional({
    description: 'Filter reactivation request created_at to (YYYY-MM-DD)',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsString()
  date_to?: string;
}