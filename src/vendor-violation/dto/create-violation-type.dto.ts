import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVendorViolationTypeDto {
  @ApiProperty({ description: 'Unique violation code (e.g., ORDER_NOT_CONFIRMED_H, REFUND_5_PER_QUARTER)', example: 'ORDER_NOT_CONFIRMED_H' })
  @IsString()
  code: string;

  @ApiProperty({ description: 'Violation category (e.g., KONFIRMASI_ORDER, RESCHEDULE, REFUND, LAINNYA)', example: 'KONFIRMASI_ORDER' })
  @IsString()
  category: string;

  @ApiProperty({ description: 'Short name of the violation', example: 'Order tidak terkonfirmasi pada Hari H' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Detailed description of the violation' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Point value for this violation (SLA points that will be deducted)', type: Number, example: 1 })
  @IsInt()
  @Min(1)
  point: number;

  @ApiPropertyOptional({ description: 'Whether this violation type is currently active', default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateVendorViolationTypeDto {
  @ApiPropertyOptional({ description: 'Unique violation code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Violation category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Short name of the violation' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Detailed description of the violation' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Point value for this violation', type: Number })
  @IsOptional()
  @IsInt()
  @Min(1)
  point?: number;

  @ApiPropertyOptional({ description: 'Whether this violation type is currently active' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class QueryVendorViolationTypeDto {
  @ApiPropertyOptional({ description: 'Page number for pagination', default: 1, type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of records per page', default: 10, type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  take?: number = 10;

  @ApiPropertyOptional({ description: 'Search by code, name, or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by active status (true/false)', type: Boolean })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  is_active?: boolean;
}