import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ViolationRevisionStatus,
  ViolationRevisionType,
} from '../../common/enum/violation-type.enum';

export class CreateViolationRevisionRequestDto {
  @ApiProperty({ type: Number })
  @IsInt()
  vendor_id: number;

  @ApiProperty({ enum: ViolationRevisionType })
  @IsEnum(ViolationRevisionType)
  type: ViolationRevisionType;

  @ApiPropertyOptional({ type: Number })
  @ValidateIf((dto) => dto.type === ViolationRevisionType.REVISE)
  @IsInt()
  target_log_id?: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1 })
  @ValidateIf((dto) => dto.type === ViolationRevisionType.REVISE)
  @IsInt()
  @Min(0)
  @Max(1)
  new_point?: number;

  @ApiProperty()
  @IsString()
  reason: string;
}

export class QueryViolationRevisionRequestDto {
  @ApiPropertyOptional({ default: 1, type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  take?: number = 10;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  vendor_id?: number;

  @ApiPropertyOptional({ enum: ViolationRevisionStatus })
  @IsOptional()
  @IsEnum(ViolationRevisionStatus)
  status?: ViolationRevisionStatus;
}

export class ReviewViolationRevisionRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  review_note?: string;
}
