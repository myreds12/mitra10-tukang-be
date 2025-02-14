import { ApiProperty } from '@nestjs/swagger';
import { StoreIncentiveDto } from './store_incentive.dto';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { ComissionStoreIncentiveStatus } from './comission_store_incentive.status';

export class CreateComissionSalesIncentiveDto {
  @ApiProperty()
  @Type(() => StoreIncentiveDto)
  @ValidateNested({ each: true })
  store_incentive: StoreIncentiveDto[];

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
