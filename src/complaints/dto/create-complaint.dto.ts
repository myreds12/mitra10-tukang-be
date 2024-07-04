import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { CreateComplaintHistoriesDto } from './create-complaint-history.dto';

export class CreateComplaintDto {
  @Type(() => Number)
  order_id: number;

  description: string;

  @IsOptional()
  pic_name?: string;
  
  @Type(() => Number)
  complaint_channel: number;

  complaint_date: string;
  
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  type: number;

  @Type(() => Number)
  complaint_status: number;

  @IsOptional()
  @Type(() => CreateComplaintHistoriesDto)
  complaint_histories?: CreateComplaintHistoriesDto;

  @ApiProperty({ type: Array<Express.Multer.File>, format: 'array' })
  complaint_evidences: Array<Express.Multer.File>;
}
