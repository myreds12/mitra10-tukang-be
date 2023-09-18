import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, IsOptional } from 'class-validator';

export class UpdateStoreDto {
  @ApiProperty()
  @IsOptional()
  @IsString()
  store_name: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  address: string;

  @ApiProperty()
  @IsOptional()
  @IsInt()
  city_id: number;

  @ApiProperty()
  @IsOptional()
  @IsString()
  zip_code: string;

  @ApiProperty()
  @IsOptional()
  @IsInt()
  updated_by: number;

  @ApiProperty()
  @IsOptional()
  @IsInt()
  deleted_by: number;
}
