import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO untuk endpoint Poin 4 (varian aggregate):
 *   POST /vendor-sp/clean-vendor-recap/export
 *
 * Generate PDF berisi LIST semua vendor yang punya 0 pelanggaran pada
 * quarter + year tsb. Filter kategori violation_type opsional (kalau
 * diisi, hanya exclude vendor yang punya pelanggaran di kategori tsb).
 */
export class CleanVendorRecapDto {
  @ApiProperty({ description: 'Quartal (1-4)', type: Number, example: 1 })
  @IsInt()
  @Min(1)
  @Max(4)
  @Transform(({ value }) => parseInt(value, 10))
  quarter: number;

  @ApiProperty({ description: 'Tahun', type: Number, example: 2026 })
  @IsInt()
  @Min(2020)
  @Max(2100)
  @Transform(({ value }) => parseInt(value, 10))
  year: number;

  @ApiPropertyOptional({
    description:
      'Filter by violation category — kalau diisi, vendor tetap masuk list selama 0 pelanggaran di KATEGORI ini (bukan total).',
    enum: ['KONFIRMASI_ORDER', 'REFUND', 'RESCHEDULE', 'LAINNYA'],
  })
  @IsOptional()
  @IsString()
  category?: string;
}