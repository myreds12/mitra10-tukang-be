import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class UpdateRemedialDto {
  @Type(() => Number)
  complaint_id: number;

  // ✅ Tidak ada batasan panjang — bisa terima teks panjang
  @IsOptional()
  @IsString()
  remedial_action: string;

  @IsOptional()
  @IsString()
  ra_date_start?: string;

  @IsOptional()
  @IsString()
  ra_date_end?: string;

  @IsOptional()
  @IsString()
  remedial_pic?: string;

  @IsOptional()
  @Type(() => String)
  @IsString()
  remedial_pic_position: string;

  @IsOptional()
  @Type(() => Number)
  remedial_status?: number;

  // ✅ File dihandle Multer
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } })
  remedial_evidences: Array<Express.Multer.File>;
}
