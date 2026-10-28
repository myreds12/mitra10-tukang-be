import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RebuildVendorSpDto {
  @ApiProperty({ example: 2026, default: 2026 })
  @IsInt()
  @Min(2026)
  @Max(2026)
  @Transform(({ value }) => Number(value))
  year = 2026;

  @ApiPropertyOptional({ example: 7, default: 7, description: 'Start month, inclusive. July 2026 = 7.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  @Transform(({ value }) => Number(value ?? 7))
  from_month = 7;

  @ApiProperty({
    type: [String],
    example: ['ORDER_NOT_CONFIRMED_H1', 'RESCHEDULE_NOT_UPDATED'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  violation_codes: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value !== false && value !== 'false')
  dry_run = true;

  @ApiPropertyOptional({ default: false, description: 'Hard-delete existing SP rows for the target year before rebuilding.' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  delete_existing = false;

  @ApiPropertyOptional({ default: false, description: 'Delete all SP and violation log rows before rebuilding.' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  delete_all = false;

  @ApiPropertyOptional({ example: 'DELETE_ALL_AND_REBUILD_VENDOR_SP_FROM_JULY_2026' })
  @IsOptional()
  @IsString()
  confirmation?: string;
}
