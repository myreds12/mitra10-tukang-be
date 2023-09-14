import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, IsOptional } from 'class-validator';

export class CreateStoreDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  store_name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty()
  @IsInt()
  city_id: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sip_code: string;

  @ApiProperty()
  @IsInt()
  created_by: number;

  @ApiProperty()
  @IsInt()
  updated_by: number;

  @ApiProperty()
  @IsOptional()
  @IsInt()
  deleted_by: number;
}
