import { IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO untuk endpoint Poin 3: POST /vendor-sp/penalty-receipt/export
 * Body wajib: vendor_id, quarter, year. Validasi vendor exists di service.
 */
export class PenaltyReceiptDto {
  @ApiProperty({ description: 'Vendor ID yang akan dicetak bukti SP-nya', type: Number, example: 1 })
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  vendor_id: number;

  @ApiProperty({ description: 'Quartal SP yang akan dicetak (1-4)', type: Number, example: 1 })
  @IsInt()
  @Min(1)
  @Max(4)
  @Transform(({ value }) => parseInt(value, 10))
  quarter: number;

  @ApiProperty({ description: 'Tahun SP yang akan dicetak', type: Number, example: 2026 })
  @IsInt()
  @Min(2020)
  @Max(2100)
  @Transform(({ value }) => parseInt(value, 10))
  year: number;
}