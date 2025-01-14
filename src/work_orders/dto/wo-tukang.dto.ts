import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';

export class WorkOrderTukang {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  id?: number;

  @Type(() => Number)
  type?: number;

  @IsOptional()
  @ApiProperty()
  notes?: string;

  @IsOptional()
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  tukang_id?: number;
}
