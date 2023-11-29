import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateMaterialDto } from './create-material.dto';

export class StatusDetails {
  @Type(() => Number)
  status_id: number;

  @IsOptional()
  @Transform(({ value }) => new Date(value))
  work_date_time?: string;

  @IsString()
  @IsOptional()
  time_spent?: string;

  @IsOptional()
  description?: string;

  @ApiProperty({ type: CreateMaterialDto })
  @Type(() => CreateMaterialDto)
  @ValidateNested({ each: true })
  work_order_items?: Array<CreateMaterialDto>;
}
