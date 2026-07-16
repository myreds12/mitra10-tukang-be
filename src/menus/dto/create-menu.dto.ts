import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateMenuDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  icon: string;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  parent_id?: number;

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  created_by?: number;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  updated_by?: number;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  deleted_by?: number;
}

export class UpdateMenuDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  url?: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  parent_id?: number;

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  updated_by?: number;

  @ApiProperty()
  @IsInt()
  @IsOptional()
  deleted_by?: number;
}
