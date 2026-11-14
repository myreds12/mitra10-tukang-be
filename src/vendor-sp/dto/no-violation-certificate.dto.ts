import { IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO untuk endpoint Poin 4: POST /vendor-sp/no-violation-certificate/export
 * Body wajib: vendor_id, quarter, year. Validasi tambahan (di service):
 * - vendor tidak punya pelanggaran AKTIF di kuartal tsb
 * - kuartal harus lampau (bukan yang sedang berjalan)
 */
export class NoViolationCertificateDto {
  @ApiProperty({ description: 'Vendor ID yang akan dicetak surat bebas pelanggaran', type: Number, example: 1 })
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  vendor_id: number;

  @ApiProperty({ description: 'Quartal lampau yang akan dicetak (1-4)', type: Number, example: 4 })
  @IsInt()
  @Min(1)
  @Max(4)
  @Transform(({ value }) => parseInt(value, 10))
  quarter: number;

  @ApiProperty({ description: 'Tahun kuartal lampau yang akan dicetak', type: Number, example: 2025 })
  @IsInt()
  @Min(2020)
  @Max(2100)
  @Transform(({ value }) => parseInt(value, 10))
  year: number;
}