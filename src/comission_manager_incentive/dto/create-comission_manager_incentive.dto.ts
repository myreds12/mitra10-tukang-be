import { ApiProperty } from '@nestjs/swagger';
import { ManagerIncentiveDto } from './manager_incentive.dto';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { ComissionStoreIncentiveStatus } from './comission_manager_incentive.status';

export class CreateComissionSalesIncentiveDto {
  @ApiProperty()
  @Type(() => ManagerIncentiveDto)
  @ValidateNested({ each: true })
  manager_incentive: ManagerIncentiveDto[];

  @IsOptional()
  @Type(() => Number)
  pph_nominal?: number;

  @IsOptional()
  @Type(() => Number)
  ppn_nominal?: number;

  @IsOptional()
  @Type(() => Number)
  pkp_nominal?: number;

  @IsOptional()
  @Type(() => Number)
  nominal?: number;

  @IsOptional()
  tanggal_awal?: any;

  @IsOptional()
  tanggal_akhir?: any;
  @IsOptional()
  incentive_id?: any;
  @ApiProperty()
  @Type(() => Number)
  @IsEnum(ComissionStoreIncentiveStatus)
  status: ComissionStoreIncentiveStatus;
}
