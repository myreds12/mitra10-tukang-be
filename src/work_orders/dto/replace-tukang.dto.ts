import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { ReplaceTukangStatus } from '../enum/replace-tukang.enum';

export class ReplaceTukangDto {
  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  id?: number;

  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  // @IsIn([ReplaceTukangStatus])
  status: ReplaceTukangStatus;

  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  tukang_id?: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  notes?: string;
}
