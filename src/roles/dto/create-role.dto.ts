import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

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
