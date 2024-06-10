import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional } from 'class-validator';
import { ServiceType } from './service-type.class.interface';
import { TukangAreaDto } from './tukang-area.dto';

export class UpdateTukangDto {
  @ApiProperty()
  full_name?: string;

  ktp_number?: string;

  phone_number?: string;

  address?: string;

  email?: string;

  username?: string;

  password?: string;

  @Type(() => Number)
  vendor_id?: number;

  @ApiProperty({ type: [ServiceType] }) //
  @Type(() => ServiceType)
  service_types?: ServiceType[];

  @ApiProperty({ type: [TukangAreaDto] })
  @Type(() => TukangAreaDto)
  tukang_area?: TukangAreaDto[];

  join_date?: string;

  bod?: string;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  ktp_file?: Express.Multer.File[] | Express.Multer.File;

  @ApiProperty({ type: 'string', format: 'string' })
  @IsOptional()
  npwp_file?: Express.Multer.File[] | Express.Multer.File;

  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  is_active: number;
}
