import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateServiceTypeDto {
  @ApiProperty()
  @IsString()
  @IsOptional()
  service_type?: string;
}
