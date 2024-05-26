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
  @Transform(({ value }) =>
    new Date(value) instanceof Date ? new Date(value) : null,
  )
  work_date_time?: string;

  @IsOptional()
  @Transform(({ value }) =>
    new Date(value) instanceof Date ? new Date(value) : null,
  )
  work_start_date?: string;

  @IsOptional()
  @Transform(({ value }) =>
    new Date(value) instanceof Date ? new Date(value) : null,
  )
  work_end_date?: string;

  @IsOptional()
  description?: string;

  @ApiProperty({ type: CreateMaterialDto })
  @Type(() => CreateMaterialDto)
  @ValidateNested({ each: true })
  work_order_items?: Array<CreateMaterialDto>;
}
