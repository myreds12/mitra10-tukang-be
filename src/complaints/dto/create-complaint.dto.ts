import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { CreateComplaintHistoriesDto } from './create-complaint-history.dto';

export class CreateComplaintDto {
  @Type(() => Number)
  order_id: number;

  @Type(() => Number)
  @IsOptional()
  crm_type?: number;

  // ✅ Tidak ada batasan panjang — bisa terima teks panjang
  @IsOptional()
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  feedback_name: string;

  @IsOptional()
  @IsString()
  feedback_role: string;

  @IsOptional()
  @IsString()
  pic_name?: string;

  @Type(() => Number)
  complaint_channel: number;

  complaint_date: string;

  @IsOptional()
  complaint_received_date?: string;

  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  type: number;

  @Type(() => Number)
  complaint_status: number;

  @Type(() => Number)
  work_status_update: number;

  @IsOptional()
  @Type(() => CreateComplaintHistoriesDto)
  complaint_histories?: CreateComplaintHistoriesDto;

  // ✅ Tidak perlu dekorator khusus — file dihandle Multer
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } })
  complaint_evidences: Array<Express.Multer.File>;
}
