import { ApiProperty } from '@nestjs/swagger';
import { SalesIncentiveDto } from './sales_incentive.dto';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { ComissionSalesIncentiveStatus } from './comission_sales_incentive.status';

export class CreateComissionSalesIncentiveDto {
  @ApiProperty()
  @Type(() => SalesIncentiveDto)
  @ValidateNested({ each: true })
  sales_incentive: SalesIncentiveDto[];

  @IsOptional()
  @Type(() => Number)
  pph_nominal?: number;

  @IsOptional()
  @Type(() => Number)
  ppn_nominal?: number;

  @IsOptional()
  @Type(() => Number)
  pkp_nominal?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsEnum(ComissionSalesIncentiveStatus)
  status: ComissionSalesIncentiveStatus;
}
