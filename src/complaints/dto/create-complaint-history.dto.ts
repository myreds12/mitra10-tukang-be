import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class CreateComplaintHistoriesDto {
  @Type(() => Number)
  @IsOptional()
  id?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
