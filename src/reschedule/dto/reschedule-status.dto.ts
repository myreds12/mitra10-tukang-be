import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class RescheduleStatusDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id?: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  status_id: number;

  @Type(() => String)
  @IsNotEmpty()
  @IsString()
  description: string;

  @Type(() => String)
  @IsNotEmpty()
  @IsString()
  status_by: string;
}
