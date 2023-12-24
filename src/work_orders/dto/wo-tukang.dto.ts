import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class WorkOrderTukang {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  id?: number;
  
  @IsNumber()
  @Type(() => Number)
  type: number;

  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsNumber()
  tukang_id: number;
}
